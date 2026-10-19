import { z } from "zod";

import { referencePlans, referenceRegions } from "./reference-catalog";
import {
	CONTINENTS,
	type Plan,
	PROVIDER_IDS,
	type ProviderAdapter,
	type ProviderId,
	type ProviderInfo,
	type Region,
} from "./types";

export const planFiltersSchema = z.object({
	providers: z.array(z.enum(PROVIDER_IDS)).optional(),
	/** Region ids, e.g. `hetzner:fsn1`. */
	regions: z.array(z.string()).optional(),
	/** ISO 3166-1 alpha-2 country codes. */
	countries: z.array(z.string().length(2)).optional(),
	continents: z.array(z.enum(CONTINENTS)).optional(),
	minVcpu: z.number().positive().optional(),
	minMemoryGb: z.number().positive().optional(),
	minDiskGb: z.number().positive().optional(),
	maxHourlyUsd: z.number().positive().optional(),
	maxMonthlyUsd: z.number().positive().optional(),
	cpuType: z.enum(["shared", "dedicated"]).optional(),
	arch: z.enum(["x86", "arm"]).optional(),
});

export type PlanFilters = z.infer<typeof planFiltersSchema>;

export type PlanSort = "price" | "vcpu" | "memory";

export interface CatalogSnapshot {
	providers: ProviderInfo[];
	regions: Region[];
	plans: Plan[];
	updatedAt: string;
}

/** A plan narrowed to the regions that satisfy the caller's location filters. */
export interface PlanMatch {
	plan: Plan;
	regions: Region[];
}

export interface Candidate {
	plan: Plan;
	region: Region;
}

const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Caches the merged catalog of all providers. Live providers are refreshed
 * every few hours; if a refresh fails we keep serving the last good copy (or
 * the reference catalog) so a flaky upstream never takes search down.
 */
export function createCatalog(adapters: ProviderAdapter[]) {
	let snapshot: CatalogSnapshot | null = null;
	let loading: Promise<CatalogSnapshot> | null = null;
	const lastGood = new Map<ProviderId, { regions: Region[]; plans: Plan[] }>();

	async function loadProvider(adapter: ProviderAdapter) {
		try {
			const [regions, plans] = await Promise.all([
				adapter.listRegions(),
				adapter.listPlans(),
			]);
			const known = new Set(regions.map((r) => r.slug));
			const cleaned = plans
				.map((p) => ({ ...p, regions: p.regions.filter((r) => known.has(r)) }))
				.filter((p) => p.regions.length > 0 && p.priceHourlyMicros > 0);
			const data = { regions, plans: cleaned };
			lastGood.set(adapter.info.id, data);
			return data;
		} catch (err) {
			console.error(
				`[catalog] ${adapter.info.id} refresh failed:`,
				(err as Error).message,
			);
			return (
				lastGood.get(adapter.info.id) ?? {
					regions: referenceRegions(adapter.info.id),
					plans: referencePlans(adapter.info.id),
				}
			);
		}
	}

	async function refresh(): Promise<CatalogSnapshot> {
		const results = await Promise.all(adapters.map(loadProvider));
		snapshot = {
			providers: adapters.map((a) => a.info),
			regions: results.flatMap((r) => r.regions),
			plans: results.flatMap((r) => r.plans),
			updatedAt: new Date().toISOString(),
		};
		return snapshot;
	}

	async function get(): Promise<CatalogSnapshot> {
		const stale =
			!snapshot || Date.now() - Date.parse(snapshot.updatedAt) > TTL_MS;
		if (stale && !loading) {
			loading = refresh().finally(() => {
				loading = null;
			});
		}
		// Serve stale data while a background refresh runs.
		if (snapshot) return snapshot;
		return loading as Promise<CatalogSnapshot>;
	}

	return { get, refresh };
}

export type Catalog = ReturnType<typeof createCatalog>;

/** The price of a plan in one region, honouring per-region overrides. */
export function priceIn(plan: Plan, regionSlug: string) {
	return (
		plan.regionPrices?.[regionSlug] ?? {
			hourlyMicros: plan.priceHourlyMicros,
			monthlyMicros: plan.priceMonthlyMicros,
		}
	);
}

/** Cheapest price among the matched regions. */
export function matchPrice({ plan, regions }: PlanMatch) {
	const prices = regions.map((r) => priceIn(plan, r.slug));
	return {
		hourlyMicros: Math.min(...prices.map((p) => p.hourlyMicros)),
		monthlyMicros: Math.min(...prices.map((p) => p.monthlyMicros)),
	};
}

export function matchPlans(
	snapshot: CatalogSnapshot,
	filters: PlanFilters,
): PlanMatch[] {
	const regionById = new Map(snapshot.regions.map((r) => [r.id, r]));
	const countries = filters.countries?.map((c) => c.toUpperCase());
	const maxHourly =
		filters.maxHourlyUsd === undefined ? undefined : filters.maxHourlyUsd * 1e6;
	const maxMonthly =
		filters.maxMonthlyUsd === undefined
			? undefined
			: filters.maxMonthlyUsd * 1e6;

	const out: PlanMatch[] = [];
	for (const plan of snapshot.plans) {
		if (filters.providers?.length && !filters.providers.includes(plan.provider))
			continue;
		if (filters.minVcpu && plan.vcpu < filters.minVcpu) continue;
		if (filters.minMemoryGb && plan.memoryGb < filters.minMemoryGb) continue;
		if (filters.minDiskGb && plan.diskGb < filters.minDiskGb) continue;
		if (filters.cpuType && plan.cpuType !== filters.cpuType) continue;
		if (filters.arch && plan.arch !== filters.arch) continue;
		const regions = plan.regions
			.map((slug) => regionById.get(`${plan.provider}:${slug}`))
			.filter((r): r is Region => {
				if (!r) return false;
				if (filters.regions?.length && !filters.regions.includes(r.id))
					return false;
				if (countries?.length && !countries.includes(r.country)) return false;
				if (
					filters.continents?.length &&
					!filters.continents.includes(r.continent)
				)
					return false;
				const price = priceIn(plan, r.slug);
				if (maxHourly !== undefined && price.hourlyMicros > maxHourly)
					return false;
				if (maxMonthly !== undefined && price.monthlyMicros > maxMonthly)
					return false;
				return true;
			})
			// Cheapest region first, so routing and display agree.
			.sort(
				(a, b) =>
					priceIn(plan, a.slug).hourlyMicros -
					priceIn(plan, b.slug).hourlyMicros,
			);
		if (regions.length) out.push({ plan, regions });
	}
	return out;
}

export function sortMatches(
	matches: PlanMatch[],
	sort: PlanSort = "price",
): PlanMatch[] {
	const byPrice = (a: PlanMatch, b: PlanMatch) =>
		matchPrice(a).hourlyMicros - matchPrice(b).hourlyMicros;
	const cmp: Record<PlanSort, (a: PlanMatch, b: PlanMatch) => number> = {
		price: (a, b) =>
			byPrice(a, b) ||
			b.plan.vcpu - a.plan.vcpu ||
			b.plan.memoryGb - a.plan.memoryGb,
		vcpu: (a, b) => b.plan.vcpu - a.plan.vcpu || byPrice(a, b),
		memory: (a, b) => b.plan.memoryGb - a.plan.memoryGb || byPrice(a, b),
	};
	return [...matches].sort(cmp[sort]);
}

/**
 * The routing step: turn requirements into an ordered list of concrete
 * (plan, region) attempts. Cheapest first (each plan in its cheapest
 * matching region); each provider appears at most twice so a single
 * provider outage can't exhaust every attempt.
 */
export function rankCandidates(
	snapshot: CatalogSnapshot,
	filters: PlanFilters,
	maxAttempts = 3,
): Candidate[] {
	const ranked = sortMatches(matchPlans(snapshot, filters), "price");
	const perProvider = new Map<ProviderId, number>();
	const out: Candidate[] = [];
	for (const { plan, regions } of ranked) {
		const used = perProvider.get(plan.provider) ?? 0;
		if (used >= 2) continue;
		const region = regions[0];
		if (!region) continue;
		out.push({ plan, region });
		perProvider.set(plan.provider, used + 1);
		if (out.length >= maxAttempts) break;
	}
	return out;
}

export function findPlan(
	snapshot: CatalogSnapshot,
	planId: string,
): Plan | undefined {
	return snapshot.plans.find((p) => p.id === planId);
}

export function findRegion(
	snapshot: CatalogSnapshot,
	regionId: string,
): Region | undefined {
	return snapshot.regions.find((r) => r.id === regionId);
}
