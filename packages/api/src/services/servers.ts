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
	type ProviderAdapter,
	ProviderError,
	type ProviderId,
	parsePublicKey,
	planFiltersSchema,
	priceIn,
	rankCandidates,
} from "@switchyard/cloud";
import { type Executor, newId } from "@switchyard/db";
import {
	apiKey,
	providerAccount,
	server,
	wallet,
} from "@switchyard/db/schema/app";
import {
	and,
	count,
	desc,
	eq,
	inArray,
	isNull,
	notInArray,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import type { Actor, Services } from "../context";
import { logActivity } from "./activity";
import { chargeUsage } from "./billing";
import {
	accountAdapter,
	adapterForServer,
	isAuthError,
	loadAccount,
	type ProviderAccountRow,
	workingAccounts,
} from "./connections";
import { listSshKeys } from "./ssh-keys";
import { ACTIVE, CLOSED, SYNCABLE } from "./statuses";
import { ensureWallet } from "./wallet";

type ServerRow = typeof server.$inferSelect;

const MAX_ATTEMPTS = 3;

const system = (userId: string): Actor => ({
	userId,
	apiKeyId: null,
	via: "system",
});

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
		feeHourlyMicros: s.feeHourlyMicros,
		totalCostMicros: s.totalCostMicros,
		totalFeeMicros: s.totalFeeMicros,
		sandbox: s.sandbox,
		labels: s.labels,
		errorMessage: s.errorMessage,
		apiKeyId: s.apiKeyId,
		createdAt: s.createdAt,
		deletedAt: s.deletedAt,
	};
}

export type SerializedServer = ReturnType<typeof serializeServer>;

/** HessianLabs's hourly fee on a server with this list price. */
export const feeFor = (svc: Services, priceHourlyMicros: number) =>
	Math.ceil((priceHourlyMicros * svc.config.feeBps) / 10_000);

const providerNames = (ids: ProviderId[]) =>
	ids.map((id) => PROVIDERS[id].name).join(", ");

async function resolveCandidates(
	svc: Services,
	input: z.output<typeof createServerInputSchema>,
	connected: ProviderId[],
) {
	if (!connected.length) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: `No cloud account is connected. Connect one at ${svc.config.webUrl}/providers, then try again.`,
		});
	}
	const snapshot = await svc.cloud.catalog.get();
	if (input.planId) {
		const plan = findPlan(snapshot, input.planId);
		if (!plan) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Unknown plan "${input.planId}". Use search_plans to find valid plan ids.`,
			});
		}
		if (!connected.includes(plan.provider)) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Your ${PROVIDERS[plan.provider].name} account isn't connected. Connect it at ${svc.config.webUrl}/providers, or pick a plan on: ${providerNames(connected)}.`,
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

	const requested = input.requirements?.providers;
	const providers = requested
		? requested.filter((p) => connected.includes(p))
		: connected;
	if (!providers.length) {
		throw new ORPCError("BAD_REQUEST", {
			message: `None of the requested providers are connected. Connected: ${providerNames(connected)}.`,
		});
	}
	const filters = {
		...input.requirements,
		providers,
		regions: input.regionId ? [input.regionId] : input.requirements?.regions,
	};
	const candidates = rankCandidates(snapshot, filters, MAX_ATTEMPTS);
	if (!candidates.length) {
		throw new ORPCError("BAD_REQUEST", {
			message: `No plan on your connected accounts (${providerNames(connected)}) matches these requirements. Relax a constraint (price, region, size), connect another provider, or call search_plans to explore.`,
		});
	}
	return candidates;
}

/** An API key's guardrails, checked against everything it already runs. */
async function checkKeyLimits(
	tx: Executor,
	key: typeof apiKey.$inferSelect,
	priceHourlyMicros: number,
) {
	const [usage] = await tx
		.select({
			n: count(),
			hourly: sql<string>`coalesce(sum(${server.priceHourlyMicros}), 0)`,
		})
		.from(server)
		.where(and(eq(server.apiKeyId, key.id), inArray(server.status, ACTIVE)));
	if (key.maxServers !== null && (usage?.n ?? 0) >= key.maxServers) {
		throw new ORPCError("FORBIDDEN", {
			message: `API key "${key.name}" may run at most ${key.maxServers} server(s). Delete one or raise the limit.`,
		});
	}
	// Leave room for an hour of everything the key runs, so parallel creates can't overshoot.
	const running = Number(usage?.hourly ?? 0);
	if (
		key.spendLimitMicros !== null &&
		key.spentMicros + running + priceHourlyMicros > key.spendLimitMicros
	) {
		throw new ORPCError("FORBIDDEN", {
			message: `API key "${key.name}" would pass its spend limit: ${formatUsd(key.spentMicros)} spent and ${formatUsd(
				running,
				{ precise: true },
			)}/h running, limit ${formatUsd(key.spendLimitMicros)}. Raise the limit in the dashboard.`,
		});
	}
}

/**
 * Checks the balance and the API key's guardrails and inserts the server row
 * in one transaction. The wallet and key rows stay locked until it commits,
 * so parallel create calls are checked one at a time instead of all passing.
 */
async function reserveServer(
	svc: Services,
	actor: Actor,
	row: typeof server.$inferInsert,
) {
	await svc.db.transaction(async (tx) => {
		const [w] = await tx
			.select({ balance: wallet.balanceMicros })
			.from(wallet)
			.where(eq(wallet.userId, actor.userId))
			.for("update");
		const balance = w?.balance ?? 0;
		const firstHourFee = row.feeHourlyMicros ?? 0;
		if (balance <= 0 || balance < firstHourFee) {
			throw new ORPCError("PAYMENT_REQUIRED", {
				message: `Insufficient credits: balance ${formatUsd(balance)}. HessianLabs's fee for this server is ${formatUsd(
					firstHourFee,
					{ precise: true },
				)}/h, paid from your balance. Add credits in the dashboard.`,
			});
		}
		if (actor.apiKeyId) {
			const [key] = await tx
				.select()
				.from(apiKey)
				.where(eq(apiKey.id, actor.apiKeyId))
				.for("update");
			if (key) await checkKeyLimits(tx, key, row.priceHourlyMicros);
		}
		await tx.insert(server).values(row);
	});
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
	const generated = generateEd25519KeyPair("hessianlabs-generated");
	return { keys: [generated.publicKey], generated };
}

export async function createServer(
	svc: Services,
	actor: Actor,
	rawInput: CreateServerInput,
) {
	const input = createServerInputSchema.parse(rawInput);
	const accounts = await workingAccounts(svc.db, actor.userId);
	let candidates = await resolveCandidates(svc, input, [...accounts.keys()]);
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

	const adapters = new Map<ProviderId, ProviderAdapter>();
	const accountFor = (c: Candidate) =>
		accounts.get(c.plan.provider) as ProviderAccountRow;
	const adapterFor = (c: Candidate) => {
		let adapter = adapters.get(c.plan.provider);
		if (!adapter) {
			adapter = accountAdapter(svc, accountFor(c));
			adapters.set(c.plan.provider, adapter);
		}
		return adapter;
	};

	const { keys, generated } = await collectSshKeys(svc, actor.userId, input);
	const userData = buildUserData(keys, input.userData);
	const id = newId("srv", 12);
	const name =
		input.name ?? `${first.region.slug.toLowerCase()}-${id.slice(-6)}`;

	const snapshotFields = (c: Candidate) => {
		const price = priceIn(c.plan, c.region.slug).hourlyMicros;
		return {
			provider: c.plan.provider,
			providerAccountId: accountFor(c).id,
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
			priceHourlyMicros: price,
			feeHourlyMicros: feeFor(svc, price),
			sandbox: adapterFor(c).info.mode === "sandbox",
		};
	};

	await ensureWallet(svc.db, actor.userId);
	await reserveServer(svc, actor, {
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
		try {
			const created = await adapterFor(candidate).createServer({
				serverId: id,
				name,
				regionSlug: candidate.region.slug,
				planSlug: candidate.plan.slug,
				image: imageFor(candidate),
				sshPublicKeys: keys,
				userData,
			});
			const now = new Date();
			[row] = await svc.db
				.update(server)
				.set({
					...snapshotFields(candidate),
					providerServerId: created.providerServerId,
					status: created.status === "running" ? "running" : "provisioning",
					ipv4: created.ipv4,
					ipv6: created.ipv6,
					billedUntil: now,
					syncedAt: now,
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

/** Charges everything up to `now`, one-hour minimum included. Retries if a metering tick lands in between. */
async function settle(svc: Services, id: string, now: Date) {
	for (let attempt = 0; attempt < 3; attempt++) {
		const [fresh] = await svc.db.select().from(server).where(eq(server.id, id));
		if (
			!fresh ||
			(await chargeUsage(svc.db, fresh, now, { finalize: true })) !== null
		)
			return;
	}
}

/**
 * Stops managing an account's servers: settles their fees and marks them
 * detached. They keep running in the user's account.
 */
export async function detachServers(
	svc: Services,
	actor: Actor,
	accountId: string,
	reason: string,
	now = new Date(),
) {
	const rows = await svc.db
		.select()
		.from(server)
		.where(
			and(
				eq(server.providerAccountId, accountId),
				inArray(server.status, ACTIVE),
			),
		);
	for (const row of rows) {
		await settle(svc, row.id, now);
		await svc.db
			.update(server)
			.set({ status: "detached", deletedAt: now })
			.where(eq(server.id, row.id));
		await logActivity(svc.db, actor, {
			action: "server.detach",
			serverId: row.id,
			message: `Stopped managing ${row.name}: ${reason}. It keeps running in your ${PROVIDERS[row.provider as ProviderId]?.name ?? row.provider} account.`,
		});
	}
	return rows.length;
}

/**
 * A 401/403 on one call may only be a missing permission. If verify() is
 * refused too, the credentials stopped working: flag the account and detach
 * its servers so their fees stop.
 */
async function checkAccount(
	svc: Services,
	account: ProviderAccountRow,
	adapter: ProviderAdapter,
	now: Date,
) {
	try {
		await adapter.verify();
		return;
	} catch (err) {
		if (!isAuthError(err)) return;
	}
	const name = PROVIDERS[account.provider as ProviderId]?.name;
	const [flagged] = await svc.db
		.update(providerAccount)
		.set({ error: `${name} no longer accepts the saved credentials` })
		.where(
			and(eq(providerAccount.id, account.id), isNull(providerAccount.error)),
		)
		.returning();
	if (!flagged) return;
	await detachServers(
		svc,
		system(account.userId),
		account.id,
		`${name} no longer accepts the saved credentials`,
		now,
	);
	await logActivity(svc.db, system(account.userId), {
		action: "provider.failed",
		message: `${name} rejected the saved credentials. Its servers are no longer managed or billed by HessianLabs.`,
	});
}

/**
 * Asks the provider about a server and records what changed. A server deleted
 * outside HessianLabs (in the provider's console) is settled and closed.
 */
export async function syncServer(
	svc: Services,
	row: ServerRow,
	now = new Date(),
): Promise<ServerRow> {
	if (!row.providerServerId || !row.providerAccountId) return row;
	const account = await loadAccount(svc.db, row.providerAccountId);
	if (!account || account.error) return row;
	const adapter = accountAdapter(svc, account);
	let remote: Awaited<ReturnType<ProviderAdapter["getServer"]>>;
	try {
		remote = await adapter.getServer(row.providerServerId);
	} catch (err) {
		if (isAuthError(err)) await checkAccount(svc, account, adapter, now);
		else
			console.error(`[servers] sync ${row.id} failed:`, (err as Error).message);
		return row;
	}

	if (remote.status === "deleted") {
		const [closing] = await svc.db
			.update(server)
			.set({ status: "deleting", syncedAt: now })
			.where(
				and(
					eq(server.id, row.id),
					inArray(server.status, [...SYNCABLE, "deleting"]),
				),
			)
			.returning();
		if (!closing) return row;
		await settle(svc, row.id, now);
		const [closed] = await svc.db
			.update(server)
			.set({ status: "deleted", deletedAt: now })
			.where(eq(server.id, row.id))
			.returning();
		await logActivity(svc.db, system(row.userId), {
			action: "server.gone",
			serverId: row.id,
			message: `${row.name} was deleted outside HessianLabs; its fee stopped`,
		});
		return closed ?? row;
	}

	const [updated] = await svc.db
		.update(server)
		.set({
			status: remote.status,
			ipv4: remote.ipv4,
			ipv6: remote.ipv6,
			syncedAt: now,
		})
		.where(and(eq(server.id, row.id), inArray(server.status, SYNCABLE)))
		.returning();
	return updated ?? row;
}

/** Fresh status for servers still booting; settled ones are synced by the background job. */
const refreshBooting = (svc: Services, row: ServerRow) =>
	row.status === "provisioning" ? syncServer(svc, row) : row;

export async function getServer(
	svc: Services,
	userId: string,
	id: string,
	opts: { waitForRunningSeconds?: number } = {},
) {
	let row = await refreshBooting(svc, await loadOwned(svc, userId, id));
	const deadline =
		Date.now() + Math.min(opts.waitForRunningSeconds ?? 0, 120) * 1000;
	while (row.status === "provisioning" && Date.now() < deadline) {
		await Bun.sleep(3000);
		row = await refreshBooting(svc, row);
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
				opts.includeDeleted ? undefined : notInArray(server.status, CLOSED),
			),
		)
		.orderBy(desc(server.createdAt))
		.limit(Math.min(opts.limit ?? 100, 500));
	const refreshed = await Promise.all(rows.map((r) => refreshBooting(svc, r)));
	return refreshed.map(serializeServer);
}

/** Destroys at the provider, settles the final fee and marks the row deleted. */
export async function destroyServer(
	svc: Services,
	actor: Actor,
	row: ServerRow,
	reason?: string,
) {
	if (row.status === "deleted") return serializeServer(row);
	const adapter = await adapterForServer(svc, row);
	const [claimed] = await svc.db
		.update(server)
		.set({ status: "deleting", syncedAt: new Date() })
		.where(
			and(
				eq(server.id, row.id),
				notInArray(server.status, ["deleting", ...CLOSED]),
			),
		)
		.returning();
	if (!claimed) {
		throw new ORPCError("CONFLICT", {
			message: `Server ${row.id} is already being deleted.`,
		});
	}
	if (row.providerServerId) {
		try {
			await adapter.deleteServer(row.providerServerId);
		} catch (err) {
			await svc.db
				.update(server)
				.set({ status: row.status })
				.where(eq(server.id, row.id));
			throw err;
		}
	}
	const now = new Date();
	await settle(svc, row.id, now);
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
	if (CLOSED.includes(row.status)) {
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
	const adapter = await adapterForServer(svc, row);
	await adapter.powerAction(row.providerServerId, action);
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
