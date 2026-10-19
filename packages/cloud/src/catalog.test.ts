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
