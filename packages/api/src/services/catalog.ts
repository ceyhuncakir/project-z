import {
	IMAGES,
	LLM_MODELS,
	type LlmSizingInput,
	matchPlans,
	matchPrice,
	type PlanFilters,
	type PlanMatch,
	type PlanSort,
	PROVIDERS,
	type ProviderId,
	planFiltersSchema,
	priceIn,
	rankCandidates,
	resolveLlm,
	sortMatches,
	totalVramGb,
} from "@switchyard/cloud";
import { z } from "zod";

import type { Services } from "../context";

export const searchPlansInputSchema = z.object({
	filters: planFiltersSchema.default({}),
	sort: z.enum(["price", "vcpu", "memory"]).default("price"),
	limit: z.number().int().min(1).max(500).default(50),
});

function serializeMatch(match: PlanMatch) {
	const { plan, regions } = match;
	const from = matchPrice(match);
	return {
		id: plan.id,
		provider: plan.provider,
		providerName: PROVIDERS[plan.provider].name,
		/** Simulated provider without a live integration yet. */
		preview: PROVIDERS[plan.provider].preview,
		name: plan.name,
		vcpu: plan.vcpu,
		memoryGb: plan.memoryGb,
		diskGb: plan.diskGb,
		transferTb: plan.transferTb,
		cpuType: plan.cpuType,
		arch: plan.arch,
		gpu: plan.gpu ? { ...plan.gpu, totalVramGb: totalVramGb(plan) } : null,
		priceHourlyMicros: from.hourlyMicros,
		priceMonthlyMicros: from.monthlyMicros,
		regions: regions.map((r) => ({
			id: r.id,
			city: r.city,
			country: r.country,
			continent: r.continent,
			priceHourlyMicros: priceIn(plan, r.slug).hourlyMicros,
		})),
	};
}

export type SerializedPlan = ReturnType<typeof serializeMatch>;

export async function searchPlans(
	svc: Services,
	opts: { filters?: PlanFilters; sort?: PlanSort; limit?: number },
) {
	const snapshot = await svc.cloud.catalog.get();
	const matches = sortMatches(
		matchPlans(snapshot, opts.filters ?? {}),
		opts.sort,
	);
	return {
		total: matches.length,
		plans: matches.slice(0, opts.limit ?? 50).map(serializeMatch),
		updatedAt: snapshot.updatedAt,
	};
}

export async function listRegions(
	svc: Services,
	filters: {
		providers?: string[];
		countries?: string[];
		continents?: string[];
	} = {},
) {
	const snapshot = await svc.cloud.catalog.get();
	const countries = filters.countries?.map((c) => c.toUpperCase());
	return snapshot.regions.filter(
		(r) =>
			(!filters.providers?.length || filters.providers.includes(r.provider)) &&
			(!countries?.length || countries.includes(r.country)) &&
			(!filters.continents?.length || filters.continents.includes(r.continent)),
	);
}

export async function listProviders(svc: Services) {
	const snapshot = await svc.cloud.catalog.get();
	return snapshot.providers.map((p) => {
		const plans = snapshot.plans.filter((pl) => pl.provider === p.id);
		return {
			...p,
			/** Users can connect their own account for it. */
			connectable: svc.cloud.connectable(p.id),
			regions: snapshot.regions.filter((r) => r.provider === p.id).length,
			plans: plans.length,
			fromHourlyMicros: plans.length
				? Math.min(...plans.map((pl) => pl.priceHourlyMicros))
				: null,
		};
	});
}

export const listImages = () => IMAGES;

/** Exactly what the router would try for these requirements, in order. */
export async function previewRoute(svc: Services, filters: PlanFilters) {
	const snapshot = await svc.cloud.catalog.get();
	return rankCandidates(snapshot, filters).map(({ plan, region }) =>
		serializeMatch({ plan, regions: [region] }),
	);
}

/** VRAM needed to serve a model, and the cheapest GPU plans that fit it. */
export async function sizeLlm(
	svc: Services,
	input: LlmSizingInput,
	limit = 5,
	providers?: ProviderId[],
) {
	const need = resolveLlm(input);
	const { plans } = await searchPlans(svc, {
		filters: { kind: "gpu", minVramGb: need.vramGb, providers },
		sort: "price",
		limit,
	});
	return { ...need, plans };
}

export const listLlmModels = () =>
	LLM_MODELS.map((m) => ({ ...m, vramGb: resolveLlm({ model: m.id }).vramGb }));
