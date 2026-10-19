import type {
	Arch,
	Continent,
	CpuType,
	Plan,
	ProviderId,
	Region,
} from "./types";

/**
 * Indicative catalog used by sandbox adapters (and as a fallback when a live
 * provider API is unreachable). Prices are approximate list prices in USD;
 * live adapters replace them with real numbers from the provider APIs.
 */

const USD = 1_000_000;

type RegionRow = [
	slug: string,
	city: string,
	country: string,
	continent: Continent,
];
type PlanRow = [
	slug: string,
	name: string,
	vcpu: number,
	memoryGb: number,
	diskGb: number,
	transferTb: number,
	cpuType: CpuType,
	arch: Arch,
	monthlyUsd: number,
	regions?: string[],
];

/** Hours a provider bills before capping at the monthly price. */
const MONTHLY_CAP_HOURS: Record<ProviderId, number> = {
	hetzner: 730,
	digitalocean: 672,
	vultr: 672,
	linode: 730,
	ovhcloud: 730,
	scaleway: 730,
};

const REGIONS: Record<ProviderId, RegionRow[]> = {
	hetzner: [
		["fsn1", "Falkenstein", "DE", "EU"],
		["nbg1", "Nuremberg", "DE", "EU"],
		["hel1", "Helsinki", "FI", "EU"],
		["ash", "Ashburn", "US", "NA"],
		["hil", "Hillsboro", "US", "NA"],
		["sin", "Singapore", "SG", "AS"],
	],
	digitalocean: [
		["nyc3", "New York", "US", "NA"],
		["sfo3", "San Francisco", "US", "NA"],
		["tor1", "Toronto", "CA", "NA"],
		["ams3", "Amsterdam", "NL", "EU"],
		["fra1", "Frankfurt", "DE", "EU"],
		["lon1", "London", "GB", "EU"],
		["sgp1", "Singapore", "SG", "AS"],
		["blr1", "Bangalore", "IN", "AS"],
		["syd1", "Sydney", "AU", "OC"],
	],
	vultr: [
		["ewr", "New Jersey", "US", "NA"],
		["ord", "Chicago", "US", "NA"],
		["lax", "Los Angeles", "US", "NA"],
		["ams", "Amsterdam", "NL", "EU"],
		["fra", "Frankfurt", "DE", "EU"],
		["lhr", "London", "GB", "EU"],
		["nrt", "Tokyo", "JP", "AS"],
		["sgp", "Singapore", "SG", "AS"],
		["syd", "Sydney", "AU", "OC"],
		["sao", "São Paulo", "BR", "SA"],
		["jnb", "Johannesburg", "ZA", "AF"],
	],
	linode: [
		["us-east", "Newark", "US", "NA"],
		["us-central", "Dallas", "US", "NA"],
		["us-west", "Fremont", "US", "NA"],
		["eu-central", "Frankfurt", "DE", "EU"],
		["eu-west", "London", "GB", "EU"],
		["se-sto", "Stockholm", "SE", "EU"],
		["ap-northeast", "Tokyo", "JP", "AS"],
		["in-maa", "Chennai", "IN", "AS"],
		["br-gru", "São Paulo", "BR", "SA"],
	],
	ovhcloud: [
		["GRA11", "Gravelines", "FR", "EU"],
		["SBG5", "Strasbourg", "FR", "EU"],
		["DE1", "Frankfurt", "DE", "EU"],
		["UK1", "London", "GB", "EU"],
		["WAW1", "Warsaw", "PL", "EU"],
		["BHS5", "Beauharnois", "CA", "NA"],
		["SGP1", "Singapore", "SG", "AS"],
		["SYD1", "Sydney", "AU", "OC"],
	],
	scaleway: [
		["fr-par-1", "Paris", "FR", "EU"],
		["fr-par-2", "Paris", "FR", "EU"],
		["nl-ams-1", "Amsterdam", "NL", "EU"],
		["pl-waw-1", "Warsaw", "PL", "EU"],
	],
};

const HETZNER_EU = ["fsn1", "nbg1", "hel1"];

const PLANS: Record<ProviderId, PlanRow[]> = {
	hetzner: [
		["cx23", "CX23", 2, 4, 40, 20, "shared", "x86", 3.99, HETZNER_EU],
		["cx33", "CX33", 4, 8, 80, 20, "shared", "x86", 6.49, HETZNER_EU],
		["cx43", "CX43", 8, 16, 160, 20, "shared", "x86", 11.49, HETZNER_EU],
		["cx53", "CX53", 16, 32, 320, 20, "shared", "x86", 21.49, HETZNER_EU],
		["cax11", "CAX11", 2, 4, 40, 20, "shared", "arm", 4.49, HETZNER_EU],
		["cax21", "CAX21", 4, 8, 80, 20, "shared", "arm", 7.49, HETZNER_EU],
		["cax31", "CAX31", 8, 16, 160, 20, "shared", "arm", 14.49, HETZNER_EU],
		["cpx21", "CPX21", 3, 4, 80, 20, "shared", "x86", 9.49],
		["cpx31", "CPX31", 4, 8, 160, 20, "shared", "x86", 16.99],
		["ccx13", "CCX13", 2, 8, 80, 20, "dedicated", "x86", 14.49],
		["ccx23", "CCX23", 4, 16, 160, 20, "dedicated", "x86", 28.49],
		["ccx33", "CCX33", 8, 32, 240, 30, "dedicated", "x86", 55.99],
	],
	digitalocean: [
		["s-1vcpu-1gb", "Basic 1 GB", 1, 1, 25, 1, "shared", "x86", 6],
		["s-1vcpu-2gb", "Basic 2 GB", 1, 2, 50, 2, "shared", "x86", 12],
		["s-2vcpu-2gb", "Basic 2 vCPU / 2 GB", 2, 2, 60, 3, "shared", "x86", 18],
		["s-2vcpu-4gb", "Basic 4 GB", 2, 4, 80, 4, "shared", "x86", 24],
		["s-4vcpu-8gb", "Basic 8 GB", 4, 8, 160, 5, "shared", "x86", 48],
		["s-8vcpu-16gb", "Basic 16 GB", 8, 16, 320, 6, "shared", "x86", 96],
		["c-2", "CPU-Optimized 2 vCPU", 2, 4, 25, 4, "dedicated", "x86", 42],
		["c-4", "CPU-Optimized 4 vCPU", 4, 8, 50, 5, "dedicated", "x86", 84],
		[
			"g-2vcpu-8gb",
			"General Purpose 8 GB",
			2,
			8,
			25,
			4,
			"dedicated",
			"x86",
			63,
		],
	],
	vultr: [
		["vc2-1c-1gb", "Regular 1 GB", 1, 1, 25, 1, "shared", "x86", 5],
		["vc2-1c-2gb", "Regular 2 GB", 1, 2, 55, 2, "shared", "x86", 10],
		["vc2-2c-4gb", "Regular 4 GB", 2, 4, 80, 3, "shared", "x86", 20],
		["vc2-4c-8gb", "Regular 8 GB", 4, 8, 160, 4, "shared", "x86", 40],
		["vc2-6c-16gb", "Regular 16 GB", 6, 16, 320, 5, "shared", "x86", 80],
		["vhf-1c-1gb", "High Frequency 1 GB", 1, 1, 32, 1, "shared", "x86", 6],
		["vhf-2c-4gb", "High Frequency 4 GB", 2, 4, 128, 3, "shared", "x86", 24],
		[
			"voc-c-2c-4gb-50s",
			"CPU Optimized 4 GB",
			2,
			4,
			50,
			4,
			"dedicated",
			"x86",
			40,
		],
	],
	linode: [
		["g6-nanode-1", "Nanode 1 GB", 1, 1, 25, 1, "shared", "x86", 5],
		["g6-standard-1", "Linode 2 GB", 1, 2, 50, 2, "shared", "x86", 12],
		["g6-standard-2", "Linode 4 GB", 2, 4, 80, 4, "shared", "x86", 24],
		["g6-standard-4", "Linode 8 GB", 4, 8, 160, 5, "shared", "x86", 48],
		["g6-standard-6", "Linode 16 GB", 6, 16, 320, 8, "shared", "x86", 96],
		["g6-dedicated-2", "Dedicated 4 GB", 2, 4, 80, 4, "dedicated", "x86", 36],
		["g6-dedicated-4", "Dedicated 8 GB", 4, 8, 160, 5, "dedicated", "x86", 72],
	],
	ovhcloud: [
		["d2-2", "Discovery d2-2", 1, 2, 25, 0, "shared", "x86", 6.2],
		["d2-4", "Discovery d2-4", 2, 4, 50, 0, "shared", "x86", 12.4],
		["d2-8", "Discovery d2-8", 4, 8, 50, 0, "shared", "x86", 23.5],
		["b3-8", "General Purpose b3-8", 2, 8, 50, 0, "dedicated", "x86", 37.5],
		["b3-16", "General Purpose b3-16", 4, 16, 100, 0, "dedicated", "x86", 75],
		["c3-4", "Compute c3-4", 2, 4, 50, 0, "dedicated", "x86", 33],
		["c3-8", "Compute c3-8", 4, 8, 100, 0, "dedicated", "x86", 66],
	],
	scaleway: [
		["DEV1-S", "DEV1-S", 2, 2, 20, 0, "shared", "x86", 7],
		["DEV1-M", "DEV1-M", 3, 4, 40, 0, "shared", "x86", 15.5],
		["PLAY2-NANO", "PLAY2-NANO", 2, 4, 20, 0, "shared", "x86", 21],
		["PLAY2-MICRO", "PLAY2-MICRO", 4, 8, 20, 0, "shared", "x86", 42],
		["PRO2-XXS", "PRO2-XXS", 2, 8, 20, 0, "shared", "x86", 44],
		["PRO2-XS", "PRO2-XS", 4, 16, 20, 0, "shared", "x86", 88],
		["COPARM1-2C-8G", "COPARM1-2C-8G", 2, 8, 20, 0, "dedicated", "arm", 34],
	],
};

export function hourlyFromMonthlyMicros(
	provider: ProviderId,
	monthlyMicros: number,
): number {
	return Math.ceil(monthlyMicros / MONTHLY_CAP_HOURS[provider]);
}

export function referenceRegions(provider: ProviderId): Region[] {
	return REGIONS[provider].map(([slug, city, country, continent]) => ({
		id: `${provider}:${slug}`,
		provider,
		slug,
		city,
		country,
		continent,
	}));
}

export function referencePlans(provider: ProviderId): Plan[] {
	const allRegions = REGIONS[provider].map(([slug]) => slug);
	return PLANS[provider].map(
		([
			slug,
			name,
			vcpu,
			memoryGb,
			diskGb,
			transferTb,
			cpuType,
			arch,
			monthlyUsd,
			regions,
		]) => {
			const priceMonthlyMicros = Math.round(monthlyUsd * USD);
			return {
				id: `${provider}:${slug}`,
				provider,
				slug,
				name,
				vcpu,
				memoryGb,
				diskGb,
				transferTb,
				cpuType,
				arch,
				priceMonthlyMicros,
				priceHourlyMicros: hourlyFromMonthlyMicros(
					provider,
					priceMonthlyMicros,
				),
				regions: regions ?? allRegions,
			};
		},
	);
}
