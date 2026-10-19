import { ORPCError } from "@orpc/server";
import {
	type Candidate,
	CONTINENTS,
	type Continent,
	formatUsd,
	type PlanFilters,
	PROVIDER_IDS,
	PROVIDERS,
	type ProviderId,
	priceIn,
} from "@switchyard/cloud";
import type { Executor } from "@switchyard/db";
import { guardrails, server, wallet } from "@switchyard/db/schema/app";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "../context";
import { ACTIVE } from "./statuses";

/** Without a row, agents get no limits and long-running emails at 24 hours. */
export const DEFAULT_LONG_RUNNING_HOURS = 24;

export const CONTINENT_NAMES: Record<Continent, string> = {
	EU: "Europe",
	NA: "North America",
	SA: "South America",
	AS: "Asia",
	OC: "Oceania",
	AF: "Africa",
};

export const guardrailsInputSchema = z.object({
	monthlySpendLimitUsd: z.number().positive().max(1_000_000).nullable(),
	maxServers: z.number().int().positive().max(10_000).nullable(),
	maxHourlyPriceUsd: z.number().positive().max(10_000).nullable(),
	/** Null or empty: every connected provider. */
	allowedProviders: z.array(z.enum(PROVIDER_IDS)).nullable(),
	/** Null or empty: anywhere. */
	allowedContinents: z.array(z.enum(CONTINENTS)).nullable(),
	allowGpu: z.boolean(),
	/** Agent servers are deleted after this many hours. Null: never. */
	defaultTtlHours: z.number().int().min(1).max(720).nullable(),
	/** Email about servers running longer than this. Null: never. */
	longRunningHours: z.number().int().min(1).max(8_760).nullable(),
});

export type Guardrails = {
	monthlySpendLimitMicros: number | null;
	maxServers: number | null;
	maxHourlyPriceMicros: number | null;
	allowedProviders: ProviderId[] | null;
	allowedContinents: Continent[] | null;
	allowGpu: boolean;
	defaultTtlHours: number | null;
	longRunningHours: number | null;
};

const orNull = <T>(list: T[] | null | undefined) =>
	list?.length ? list : null;

export async function getGuardrails(
	db: Executor,
	accountId: string,
): Promise<Guardrails> {
	const [row] = await db
		.select()
		.from(guardrails)
		.where(eq(guardrails.userId, accountId));
	return {
		monthlySpendLimitMicros: row?.monthlySpendLimitMicros ?? null,
		maxServers: row?.maxServers ?? null,
		maxHourlyPriceMicros: row?.maxHourlyPriceMicros ?? null,
		allowedProviders: orNull(row?.allowedProviders as ProviderId[] | null),
		allowedContinents: orNull(row?.allowedContinents as Continent[] | null),
		allowGpu: row?.allowGpu ?? true,
		defaultTtlHours: row?.defaultTtlHours ?? null,
		longRunningHours: row ? row.longRunningHours : DEFAULT_LONG_RUNNING_HOURS,
	};
}

export async function updateGuardrails(
	db: Executor,
	accountId: string,
	input: z.infer<typeof guardrailsInputSchema>,
) {
	const toMicros = (usd: number | null) =>
		usd === null ? null : Math.round(usd * 1e6);
	const values = {
		monthlySpendLimitMicros: toMicros(input.monthlySpendLimitUsd),
		maxServers: input.maxServers,
		maxHourlyPriceMicros: toMicros(input.maxHourlyPriceUsd),
		allowedProviders: orNull(input.allowedProviders),
		allowedContinents: orNull(input.allowedContinents),
		allowGpu: input.allowGpu,
		defaultTtlHours: input.defaultTtlHours,
		longRunningHours: input.longRunningHours,
	};
	await db
		.insert(guardrails)
		.values({ userId: accountId, ...values })
		.onConflictDoUpdate({ target: guardrails.userId, set: values });
	return getGuardrails(db, accountId);
}

/** Guardrails bind agents (API keys, MCP); people in the dashboard aren't limited. */
export const isAgent = (actor: Actor) =>
	actor.via === "api" || actor.via === "mcp";

const intersect = <T>(requested: T[] | undefined, allowed: T[] | null) =>
	allowed
		? requested
			? requested.filter((x) => allowed.includes(x))
			: allowed
		: requested;

const forbidden = (message: string) =>
	new ORPCError("FORBIDDEN", {
		message: `${message} An admin can change this in Settings → Guardrails.`,
	});

/**
 * Narrows an agent's search to what the guardrails allow, or throws saying
 * which guardrail the request itself breaks.
 */
export function applyGuardrails(
	requirements: PlanFilters | undefined,
	g: Guardrails,
	opts: { gpuImage: boolean },
): PlanFilters {
	const wantsGpu =
		opts.gpuImage ||
		requirements?.kind === "gpu" ||
		Boolean(
			requirements?.gpuModels?.length ||
				requirements?.minGpuCount ||
				requirements?.minVramGb,
		);
	if (!g.allowGpu && wantsGpu) {
		throw forbidden("Agents may not create GPU servers in this account.");
	}
	const providers = intersect(requirements?.providers, g.allowedProviders);
	if (providers?.length === 0) {
		throw forbidden(
			`Agents may only use ${g.allowedProviders?.map((p) => PROVIDERS[p].name).join(", ")}.`,
		);
	}
	const continents = intersect(requirements?.continents, g.allowedContinents);
	if (continents?.length === 0) {
		throw forbidden(
			`Agents may only create servers in ${g.allowedContinents?.map((x) => CONTINENT_NAMES[x]).join(", ")}.`,
		);
	}
	const maxHourlyUsd =
		g.maxHourlyPriceMicros === null
			? requirements?.maxHourlyUsd
			: Math.min(
					requirements?.maxHourlyUsd ?? Number.POSITIVE_INFINITY,
					g.maxHourlyPriceMicros / 1e6,
				);
	return {
		...requirements,
		providers,
		continents,
		maxHourlyUsd,
		kind:
			!g.allowGpu && requirements?.kind === "any" ? "cpu" : requirements?.kind,
	};
}

/** Throws if every candidate breaks a guardrail; otherwise keeps the ones that don't. */
export function allowedCandidates<C extends Candidate>(
	candidates: C[],
	g: Guardrails,
): C[] {
	const allowed = candidates.filter((c) => violation(c, g) === null);
	if (!allowed.length && candidates[0]) {
		throw forbidden(violation(candidates[0], g) as string);
	}
	return allowed;
}

/** Why the guardrails rule out this plan and region, or null if they don't. */
export function violation(c: Candidate, g: Guardrails): string | null {
	if (g.allowedProviders && !g.allowedProviders.includes(c.plan.provider)) {
		return `Agents may only use ${g.allowedProviders.map((p) => PROVIDERS[p].name).join(", ")}, not ${PROVIDERS[c.plan.provider].name}.`;
	}
	if (
		g.allowedContinents &&
		!g.allowedContinents.includes(c.region.continent)
	) {
		return `Agents may only create servers in ${g.allowedContinents.map((x) => CONTINENT_NAMES[x]).join(", ")}; ${c.region.city} is in ${CONTINENT_NAMES[c.region.continent]}.`;
	}
	if (!g.allowGpu && c.plan.gpu) {
		return "Agents may not create GPU servers in this account.";
	}
	const price = priceIn(c.plan, c.region.slug).hourlyMicros;
	if (g.maxHourlyPriceMicros !== null && price > g.maxHourlyPriceMicros) {
		return `${c.plan.id} costs ${formatUsd(price, { precise: true })}/h; agents may create servers up to ${formatUsd(g.maxHourlyPriceMicros, { precise: true })}/h.`;
	}
	return null;
}

const startOfMonth = (d: Date) =>
	new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

/** This calendar month's estimated provider cost, from the wallet's counter. */
export function monthSpent(
	w: { monthSpentMicros: number; monthStartedAt: Date | null },
	now = new Date(),
) {
	return w.monthStartedAt &&
		w.monthStartedAt.getTime() >= startOfMonth(now).getTime()
		? w.monthSpentMicros
		: 0;
}

/** SQL for adding `cost` to the wallet's month counter, starting over each month. */
export function addMonthSpend(cost: number, at: Date) {
	const month = startOfMonth(at);
	return {
		monthSpentMicros: sql`case when ${wallet.monthStartedAt} is null or ${wallet.monthStartedAt} < ${month} then ${cost} else ${wallet.monthSpentMicros} + ${cost} end`,
		monthStartedAt: month,
	};
}

/**
 * The account-wide caps, checked inside reserveServer's transaction while
 * the wallet row is locked, so parallel creates can't slip past them.
 */
export async function checkAccountLimits(
	tx: Executor,
	accountId: string,
	g: Guardrails,
	w: { monthSpentMicros: number; monthStartedAt: Date | null },
	priceHourlyMicros: number,
) {
	if (g.maxServers === null && g.monthlySpendLimitMicros === null) return;
	const [usage] = await tx
		.select({
			n: count(),
			hourly: sql<string>`coalesce(sum(${server.priceHourlyMicros}), 0)`,
		})
		.from(server)
		.where(and(eq(server.userId, accountId), inArray(server.status, ACTIVE)));
	if (g.maxServers !== null && (usage?.n ?? 0) >= g.maxServers) {
		throw new ORPCError("FORBIDDEN", {
			message: `This account allows agents at most ${g.maxServers} active server(s), and it has ${usage?.n ?? 0}. Delete one, or ask an admin to raise the limit in Settings → Guardrails.`,
		});
	}
	// Leave room for an hour of everything running, like API key limits do.
	const spent = monthSpent(w);
	const running = Number(usage?.hourly ?? 0);
	if (
		g.monthlySpendLimitMicros !== null &&
		spent + running + priceHourlyMicros > g.monthlySpendLimitMicros
	) {
		throw new ORPCError("FORBIDDEN", {
			message: `This would pass the account's monthly limit for agents: ${formatUsd(spent)} spent this month and ${formatUsd(running, { precise: true })}/h running, limit ${formatUsd(g.monthlySpendLimitMicros)}. Ask an admin to raise it in Settings → Guardrails.`,
		});
	}
}

/**
 * The time limit a new server gets. Agents get the account's limit and may
 * only ask for less; people choose freely, and get none by default.
 */
export function timeLimitHours(
	actor: Actor,
	g: Guardrails,
	requested: number | undefined,
): number | null {
	if (!isAgent(actor) || g.defaultTtlHours === null) return requested ?? null;
	return Math.min(requested ?? g.defaultTtlHours, g.defaultTtlHours);
}
