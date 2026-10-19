import { describe, expect, test } from "bun:test";

import {
	type CatalogSnapshot,
	matchPlans,
	priceIn,
	rankCandidates,
	sortMatches,
} from "./catalog";
import { buildUserData } from "./cloud-init";
import { generateEd25519KeyPair, parsePublicKey } from "./ssh";
import type { Plan, Region } from "./types";

const region = (
	provider: Plan["provider"],
	slug: string,
	country: string,
	continent: Region["continent"],
): Region => ({
	id: `${provider}:${slug}`,
	provider,
	slug,
	city: slug,
	country,
	continent,
});

const plan = (
	provider: Plan["provider"],
	slug: string,
	hourly: number,
	regions: string[],
	extra: Partial<Plan> = {},
): Plan => ({
	id: `${provider}:${slug}`,
	provider,
	slug,
	name: slug,
	vcpu: 2,
	memoryGb: 4,
	diskGb: 40,
	transferTb: 1,
	cpuType: "shared",
	arch: "x86",
	priceHourlyMicros: hourly,
	priceMonthlyMicros: hourly * 730,
	regions,
	...extra,
});

const snapshot: CatalogSnapshot = {
	providers: [],
	updatedAt: new Date().toISOString(),
	regions: [
		region("hetzner", "fsn1", "DE", "EU"),
		region("hetzner", "ash", "US", "NA"),
		region("vultr", "ewr", "US", "NA"),
		region("vultr", "fra", "DE", "EU"),
	],
	plans: [
		plan("hetzner", "a", 5_000, ["fsn1", "ash"], {
			regionPrices: {
				ash: { hourlyMicros: 9_000, monthlyMicros: 9_000 * 730 },
			},
		}),
		plan("hetzner", "b", 6_000, ["fsn1"]),
		plan("hetzner", "c", 6_500, ["fsn1"]),
		plan("vultr", "d", 7_000, ["ewr", "fra"]),
	],
};

describe("catalog routing", () => {
	test("uses per-region prices when filtering and ranking", () => {
		const us = sortMatches(matchPlans(snapshot, { countries: ["US"] }));
		expect(us.map((m) => m.plan.id)).toEqual(["vultr:d", "hetzner:a"]);
		const hetzner = us[1]?.plan;
		expect(hetzner && priceIn(hetzner, "ash").hourlyMicros).toBe(9_000);
		// Under $0.008/h only Vultr qualifies in the US: Hetzner's US price is higher.
		expect(
			matchPlans(snapshot, { countries: ["US"], maxHourlyUsd: 0.008 }).map(
				(m) => m.plan.id,
			),
		).toEqual(["vultr:d"]);
	});

	test("tries at most two plans per provider so fallback crosses providers", () => {
		const ranked = rankCandidates(snapshot, { continents: ["EU"] });
		expect(ranked.map((c) => c.plan.id)).toEqual([
			"hetzner:a",
			"hetzner:b",
			"vultr:d",
		]);
		expect(ranked[0]?.region.slug).toBe("fsn1");
	});
});

describe("ssh + cloud-init", () => {
	test("generated keys parse and are installed for root", () => {
		const key = generateEd25519KeyPair("t");
		expect(parsePublicKey(key.publicKey)?.fingerprint).toBe(key.fingerprint);
		const ud = buildUserData([key.publicKey]);
		expect(ud.startsWith("#cloud-config")).toBe(true);
		expect(ud).toContain("disable_root: false");
		expect(ud).toContain(key.publicKey);
	});

	test("caller user-data is combined as MIME multipart", () => {
		const ud = buildUserData(["ssh-ed25519 AAAA x"], "#!/bin/sh\necho hi");
		expect(ud).toContain("multipart/mixed");
		expect(ud).toContain("text/x-shellscript");
		expect(ud).toContain("echo hi");
	});
});

describe("gpu plans", () => {
	const gpuSnapshot: CatalogSnapshot = {
		...snapshot,
		regions: [...snapshot.regions, region("runpod", "us-tx-3", "US", "NA")],
		plans: [
			...snapshot.plans,
			plan("runpod", "h100", 2_390_000, ["us-tx-3"], {
				gpu: { model: "H100", count: 1, vramGb: 80 },
			}),
			plan("runpod", "2x-a100", 3_280_000, ["us-tx-3"], {
				gpu: { model: "A100 80GB", count: 2, vramGb: 80 },
			}),
		],
	};

	test("CPU searches never return GPU plans unless asked", () => {
		expect(matchPlans(gpuSnapshot, {}).some((m) => m.plan.gpu)).toBe(false);
		expect(matchPlans(gpuSnapshot, { kind: "gpu" })).toHaveLength(2);
		expect(matchPlans(gpuSnapshot, { kind: "any" })).toHaveLength(6);
	});

	test("filters by total VRAM and model name", () => {
		expect(
			matchPlans(gpuSnapshot, { minVramGb: 100 }).map((m) => m.plan.id),
		).toEqual(["runpod:2x-a100"]);
		expect(
			matchPlans(gpuSnapshot, { gpuModels: ["h100"] }).map((m) => m.plan.id),
		).toEqual(["runpod:h100"]);
	});
});

describe("llm sizing", () => {
	test("estimates VRAM from parameters and precision", async () => {
		const { resolveLlm } = await import("./llm");
		expect(resolveLlm({ model: "llama-3.3-70b" }).vramGb).toBe(170);
		expect(
			resolveLlm({ model: "llama-3.3-70b", precision: "int4" }).vramGb,
		).toBe(43);
		expect(resolveLlm({ model: "gpt-oss-120b" }).vramGb).toBeLessThanOrEqual(
			80,
		);
		expect(resolveLlm({ paramsB: 7 }).precision).toBe("fp16");
		expect(() => resolveLlm({ model: "nope" })).toThrow(/Unknown model/);
	});
});
