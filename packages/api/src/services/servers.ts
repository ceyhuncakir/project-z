import { ORPCError } from "@orpc/server";
import {
	buildUserData,
	type Candidate,
	DEFAULT_GPU_IMAGE,
	DEFAULT_IMAGE,
	findPlan,
	findRegion,
	formatUsd,
	generateEd25519KeyPair,
	IMAGE_IDS,
	IMAGES,
	matchPlans,
	type PowerAction,
	PROVIDERS,
	ProviderError,
	type ProviderId,
	parsePublicKey,
	planFiltersSchema,
	priceIn,
	rankCandidates,
} from "@switchyard/cloud";
import { newId } from "@switchyard/db";
import { apiKey, server } from "@switchyard/db/schema/app";
import { and, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";

import type { Actor, Services } from "../context";
import { logActivity } from "./activity";
import { chargeUsage } from "./billing";
import { listSshKeys } from "./ssh-keys";
import { ensureWallet, getBalance } from "./wallet";

type ServerRow = typeof server.$inferSelect;

const ACTIVE = [
	"provisioning",
	"running",
	"stopped",
	"suspended",
	"deleting",
] as const;
const MAX_ATTEMPTS = 3;

export const createServerInputSchema = z.object({
	name: z
		.string()
		.regex(
			/^[a-z0-9][a-z0-9-]{0,62}$/i,
			"Use letters, digits and dashes (max 63)",
		)
		.optional(),
	/** Exact plan, e.g. `hetzner:cx23`. Omit to let the router choose. */
	planId: z.string().optional(),
	/** Exact region, e.g. `hetzner:fsn1`. */
	regionId: z.string().optional(),
	/** Used when `planId` is omitted: the cheapest matching plan wins. */
	requirements: planFiltersSchema.optional(),
	/** Defaults to Ubuntu 24.04, or Ubuntu 22.04 + CUDA on GPU plans. */
	image: z.enum(IMAGE_IDS).optional(),
	sshPublicKeys: z.array(z.string()).max(10).optional(),
	/** Saved SSH key ids. Defaults to all saved keys when no keys are passed. */
	sshKeyIds: z.array(z.string()).max(10).optional(),
	userData: z.string().max(32_000).optional(),
	labels: z.record(z.string(), z.string().max(63)).optional(),
});

export type CreateServerInput = z.input<typeof createServerInputSchema>;

export function serializeServer(s: ServerRow) {
	return {
		id: s.id,
		name: s.name,
		status: s.status,
		provider: s.provider,
		providerName: PROVIDERS[s.provider as ProviderId]?.name ?? s.provider,
		regionId: `${s.provider}:${s.regionSlug}`,
		city: s.city,
		country: s.country,
		planId: `${s.provider}:${s.planSlug}`,
		planName: s.planName,
		vcpu: s.vcpu,
		memoryGb: s.memoryGb,
		diskGb: s.diskGb,
		gpu: s.gpu,
		image: s.image,
		ipv4: s.ipv4,
		ipv6: s.ipv6,
		priceHourlyMicros: s.priceHourlyMicros,
		totalCostMicros: s.totalCostMicros,
		sandbox: s.sandbox,
		labels: s.labels,
		errorMessage: s.errorMessage,
		apiKeyId: s.apiKeyId,
		createdAt: s.createdAt,
		deletedAt: s.deletedAt,
	};
}

export type SerializedServer = ReturnType<typeof serializeServer>;

async function resolveCandidates(
	svc: Services,
	input: z.output<typeof createServerInputSchema>,
) {
	const snapshot = await svc.cloud.catalog.get();
	if (input.planId) {
		const plan = findPlan(snapshot, input.planId);
		if (!plan) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Unknown plan "${input.planId}". Use search_plans to find valid plan ids.`,
			});
		}
		if (input.regionId) {
			const region = findRegion(snapshot, input.regionId);
			if (
				!region ||
				region.provider !== plan.provider ||
				!plan.regions.includes(region.slug)
			) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Plan ${plan.id} is not available in "${input.regionId}". Available: ${plan.regions
						.map((r) => `${plan.provider}:${r}`)
						.join(", ")}`,
				});
			}
			return [{ plan, region }];
		}
		// Same plan, but any region that satisfies the location filters.
		const match = matchPlans(
			{ ...snapshot, plans: [plan] },
			{ ...input.requirements, providers: [plan.provider] },
		)[0];
		if (!match) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Plan ${plan.id} has no region matching your location requirements.`,
			});
		}
		return match.regions
			.slice(0, MAX_ATTEMPTS)
			.map((region) => ({ plan, region }));
	}

	const filters = {
		...input.requirements,
		regions: input.regionId ? [input.regionId] : input.requirements?.regions,
	};
	const candidates = rankCandidates(snapshot, filters, MAX_ATTEMPTS);
	if (!candidates.length) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"No plan matches these requirements. Relax a constraint (price, region, size) or call search_plans to explore.",
		});
	}
	return candidates;
}

async function checkSpendGuards(
	svc: Services,
	actor: Actor,
	firstHourMicros: number,
) {
	const balance = await getBalance(svc.db, actor.userId);
	if (balance < firstHourMicros) {
		throw new ORPCError("PAYMENT_REQUIRED", {
			message: `Insufficient credits: balance ${formatUsd(balance)}, this server needs at least ${formatUsd(
				firstHourMicros,
			)} (one hour). Add credits in the dashboard.`,
		});
	}
	if (!actor.apiKeyId) return;
	const [key] = await svc.db
		.select()
		.from(apiKey)
		.where(eq(apiKey.id, actor.apiKeyId));
	if (!key) return;
	if (
		key.spendLimitMicros !== null &&
		key.spentMicros + firstHourMicros > key.spendLimitMicros
	) {
		throw new ORPCError("FORBIDDEN", {
			message: `API key "${key.name}" reached its spend limit (${formatUsd(key.spentMicros)} of ${formatUsd(
				key.spendLimitMicros,
			)}). Raise the limit in the dashboard.`,
		});
	}
	if (key.maxServers !== null) {
		const [row] = await svc.db
			.select({ n: count() })
			.from(server)
			.where(
				and(eq(server.apiKeyId, key.id), inArray(server.status, [...ACTIVE])),
			);
		if ((row?.n ?? 0) >= key.maxServers) {
			throw new ORPCError("FORBIDDEN", {
				message: `API key "${key.name}" may run at most ${key.maxServers} server(s). Delete one or raise the limit.`,
			});
		}
	}
}

async function collectSshKeys(
	svc: Services,
	userId: string,
	input: z.output<typeof createServerInputSchema>,
) {
	const inline = (input.sshPublicKeys ?? [])
		.map((k) => k.trim())
		.filter(Boolean);
	for (const k of inline) {
		if (!parsePublicKey(k)) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Invalid SSH public key: ${k.slice(0, 40)}…`,
			});
		}
	}
	const useSaved = input.sshKeyIds !== undefined || inline.length === 0;
	const saved = useSaved
		? await listSshKeys(svc.db, userId, input.sshKeyIds)
		: [];
	const keys = [...new Set([...inline, ...saved.map((s) => s.publicKey)])];
	if (keys.length) return { keys, generated: null };
	const generated = generateEd25519KeyPair("switchyard-generated");
	return { keys: [generated.publicKey], generated };
}

export async function createServer(
	svc: Services,
	actor: Actor,
	rawInput: CreateServerInput,
) {
	const input = createServerInputSchema.parse(rawInput);
	let candidates = await resolveCandidates(svc, input);
	if (IMAGES.find((i) => i.id === input.image)?.gpu) {
		candidates = candidates.filter((c) => c.plan.gpu);
		if (!candidates.length) {
			throw new ORPCError("BAD_REQUEST", {
				message: `${input.image} needs a GPU plan. Add GPU requirements (kind: "gpu", min_vram_gb) or pick a GPU plan.`,
			});
		}
	}
	const imageFor = (c: Candidate) =>
		input.image ?? (c.plan.gpu ? DEFAULT_GPU_IMAGE : DEFAULT_IMAGE);
	const first = candidates[0] as Candidate;
	await ensureWallet(svc.db, actor.userId);
	await checkSpendGuards(
		svc,
		actor,
		priceIn(first.plan, first.region.slug).hourlyMicros,
	);

	const { keys, generated } = await collectSshKeys(svc, actor.userId, input);
	const userData = buildUserData(keys, input.userData);
	const id = newId("srv", 12);
	const name =
		input.name ?? `${first.region.slug.toLowerCase()}-${id.slice(-6)}`;

	const snapshotFields = (c: Candidate) => ({
		provider: c.plan.provider,
		regionSlug: c.region.slug,
		city: c.region.city,
		country: c.region.country,
		planSlug: c.plan.slug,
		planName: c.plan.name,
		vcpu: c.plan.vcpu,
		memoryGb: c.plan.memoryGb,
		diskGb: c.plan.diskGb,
		gpu: c.plan.gpu
			? `${c.plan.gpu.count}× ${c.plan.gpu.model}, ${c.plan.gpu.count * c.plan.gpu.vramGb} GB VRAM`
			: null,
		image: imageFor(c),
		priceHourlyMicros: priceIn(c.plan, c.region.slug).hourlyMicros,
		sandbox: svc.cloud.adapter(c.plan.provider).info.mode === "sandbox",
	});

	await svc.db.insert(server).values({
		id,
		userId: actor.userId,
		apiKeyId: actor.apiKeyId,
		name,
		labels: input.labels ?? {},
		status: "provisioning",
		...snapshotFields(first),
	});

	const attempts: { planId: string; regionId: string; error: string }[] = [];
	let row: ServerRow | undefined;
	for (const candidate of candidates) {
		const adapter = svc.cloud.adapter(candidate.plan.provider);
		try {
			const created = await adapter.createServer({
				serverId: id,
				name,
				regionSlug: candidate.region.slug,
				planSlug: candidate.plan.slug,
				image: imageFor(candidate),
				sshPublicKeys: keys,
				userData,
			});
			[row] = await svc.db
				.update(server)
				.set({
					...snapshotFields(candidate),
					providerServerId: created.providerServerId,
					status: created.status === "running" ? "running" : "provisioning",
					ipv4: created.ipv4,
					ipv6: created.ipv6,
					billedUntil: new Date(),
				})
				.where(eq(server.id, id))
				.returning();
			break;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			attempts.push({
				planId: candidate.plan.id,
				regionId: candidate.region.id,
				error: message,
			});
			if (!(err instanceof ProviderError && err.retryable)) break;
		}
	}

	if (!row) {
		const errorMessage = attempts
			.map((a) => `${a.planId}@${a.regionId}: ${a.error}`)
			.join("; ");
		await svc.db
			.update(server)
			.set({ status: "error", errorMessage, deletedAt: new Date() })
			.where(eq(server.id, id));
		await logActivity(svc.db, actor, {
			action: "server.create_failed",
			serverId: id,
			message: `Could not create ${name}: every candidate failed`,
			metadata: { attempts },
		});
		throw new ORPCError("SERVICE_UNAVAILABLE", {
			message: `Provisioning failed after ${attempts.length} attempt(s): ${errorMessage}`,
		});
	}

	await logActivity(svc.db, actor, {
		action: "server.create",
		serverId: row.id,
		message: `Created ${row.name} (${row.planName}, ${row.city}) on ${PROVIDERS[row.provider as ProviderId].name}`,
		metadata: {
			planId: `${row.provider}:${row.planSlug}`,
			fallbacks: attempts,
		},
	});

	return {
		server: serializeServer(row),
		fallbacks: attempts,
		ssh: {
			user: "root",
			keysInstalled: keys.length,
			privateKey: generated?.privateKey ?? null,
			note: generated
				? "No SSH key was supplied, so one was generated. This private key is shown once and never stored — save it now."
				: undefined,
		},
	};
}

async function loadOwned(svc: Services, userId: string, id: string) {
	const [row] = await svc.db
		.select()
		.from(server)
		.where(and(eq(server.id, id), eq(server.userId, userId)));
	if (!row)
		throw new ORPCError("NOT_FOUND", { message: `Server ${id} not found` });
	return row;
}

/** Pulls fresh status from the provider for servers still booting. */
export async function refreshServer(
	svc: Services,
	row: ServerRow,
): Promise<ServerRow> {
	if (row.status !== "provisioning" || !row.providerServerId) return row;
	try {
		const remote = await svc.cloud
			.adapter(row.provider as ProviderId)
			.getServer(row.providerServerId);
		const status = remote.status === "deleted" ? row.status : remote.status;
		if (
			status === row.status &&
			remote.ipv4 === row.ipv4 &&
			remote.ipv6 === row.ipv6
		)
			return row;
		const [updated] = await svc.db
			.update(server)
			.set({ status, ipv4: remote.ipv4, ipv6: remote.ipv6 })
			.where(eq(server.id, row.id))
			.returning();
		return updated ?? row;
	} catch (err) {
		console.error(
			`[servers] refresh ${row.id} failed:`,
			(err as Error).message,
		);
		return row;
	}
}

export async function getServer(
	svc: Services,
	userId: string,
	id: string,
	opts: { waitForRunningSeconds?: number } = {},
) {
	let row = await refreshServer(svc, await loadOwned(svc, userId, id));
	const deadline =
		Date.now() + Math.min(opts.waitForRunningSeconds ?? 0, 120) * 1000;
	while (row.status === "provisioning" && Date.now() < deadline) {
		await Bun.sleep(3000);
		row = await refreshServer(svc, row);
	}
	return serializeServer(row);
}

export async function listServers(
	svc: Services,
	userId: string,
	opts: { includeDeleted?: boolean; limit?: number } = {},
) {
	const rows = await svc.db
		.select()
		.from(server)
		.where(
			and(
				eq(server.userId, userId),
				opts.includeDeleted
					? undefined
					: notInArray(server.status, ["deleted", "error"]),
			),
		)
		.orderBy(desc(server.createdAt))
		.limit(Math.min(opts.limit ?? 100, 500));
	const refreshed = await Promise.all(rows.map((r) => refreshServer(svc, r)));
	return refreshed.map(serializeServer);
}

/** Destroys at the provider, settles the final bill and marks the row deleted. */
export async function destroyServer(
	svc: Services,
	actor: Actor,
	row: ServerRow,
	reason?: string,
) {
	if (row.status === "deleted") return serializeServer(row);
	if (row.providerServerId) {
		await svc.cloud
			.adapter(row.provider as ProviderId)
			.deleteServer(row.providerServerId);
	}
	const now = new Date();
	// A metering tick may land between loading the row and charging; retry on a fresh copy.
	for (let attempt = 0; attempt < 3; attempt++) {
		const [fresh] = await svc.db
			.select()
			.from(server)
			.where(eq(server.id, row.id));
		if (
			!fresh ||
			(await chargeUsage(svc.db, fresh, now, { finalize: true })) !== null
		)
			break;
	}
	const [updated] = await svc.db
		.update(server)
		.set({ status: "deleted", deletedAt: now })
		.where(eq(server.id, row.id))
		.returning();
	await logActivity(svc.db, actor, {
		action: "server.delete",
		serverId: row.id,
		message: `Deleted ${row.name}${reason ? ` — ${reason}` : ""}`,
	});
	return serializeServer(updated ?? row);
}

export async function deleteServer(svc: Services, actor: Actor, id: string) {
	const row = await loadOwned(svc, actor.userId, id);
	if (row.status === "deleted" || row.status === "error") {
		throw new ORPCError("BAD_REQUEST", {
			message: `Server ${id} is already ${row.status}`,
		});
	}
	return destroyServer(svc, actor, row);
}

const ALLOWED: Record<PowerAction, ServerRow["status"][]> = {
	start: ["stopped", "suspended"],
	stop: ["running"],
	reboot: ["running"],
};

export async function powerAction(
	svc: Services,
	actor: Actor,
	id: string,
	action: PowerAction,
) {
	const row = await loadOwned(svc, actor.userId, id);
	if (!ALLOWED[action].includes(row.status) || !row.providerServerId) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Cannot ${action} a server that is ${row.status}.`,
		});
	}
	if (action === "start" && (await getBalance(svc.db, actor.userId)) <= 0) {
		throw new ORPCError("PAYMENT_REQUIRED", {
			message: "Add credits before starting servers again.",
		});
	}
	await svc.cloud
		.adapter(row.provider as ProviderId)
		.powerAction(row.providerServerId, action);
	const [updated] = await svc.db
		.update(server)
		.set({
			status: action === "stop" ? "stopped" : "running",
			suspendedAt: action === "start" ? null : row.suspendedAt,
		})
		.where(eq(server.id, id))
		.returning();
	await logActivity(svc.db, actor, {
		action: `server.${action}`,
		serverId: id,
		message: `${action[0]?.toUpperCase()}${action.slice(1)} ${row.name}`,
	});
	return serializeServer(updated ?? row);
}
