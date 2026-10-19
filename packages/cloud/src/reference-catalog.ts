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
const MONTHLY_CAP_HOURS: Partial<Record<ProviderId, number>> = {
	digitalocean: 672,
	vultr: 672,
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
	upcloud: [
		["fi-hel1", "Helsinki", "FI", "EU"],
		["de-fra1", "Frankfurt", "DE", "EU"],
		["nl-ams1", "Amsterdam", "NL", "EU"],
		["uk-lon1", "London", "GB", "EU"],
		["es-mad1", "Madrid", "ES", "EU"],
		["us-nyc1", "New York", "US", "NA"],
		["us-chi1", "Chicago", "US", "NA"],
		["sg-sin1", "Singapore", "SG", "AS"],
		["au-syd1", "Sydney", "AU", "OC"],
	],
	contabo: [
		["eu-nue", "Nuremberg", "DE", "EU"],
		["uk-pts", "Portsmouth", "GB", "EU"],
		["us-stl", "St. Louis", "US", "NA"],
		["us-sea", "Seattle", "US", "NA"],
		["sg-sin", "Singapore", "SG", "AS"],
		["jp-tyo", "Tokyo", "JP", "AS"],
		["in-bom", "Mumbai", "IN", "AS"],
		["au-syd", "Sydney", "AU", "OC"],
	],
	civo: [
		["lon1", "London", "GB", "EU"],
		["fra1", "Frankfurt", "DE", "EU"],
		["nyc1", "New York", "US", "NA"],
		["phx1", "Phoenix", "US", "NA"],
		["mum1", "Mumbai", "IN", "AS"],
	],
	exoscale: [
		["ch-gva-2", "Geneva", "CH", "EU"],
		["ch-dk-2", "Zurich", "CH", "EU"],
		["de-fra-1", "Frankfurt", "DE", "EU"],
		["de-muc-1", "Munich", "DE", "EU"],
		["at-vie-1", "Vienna", "AT", "EU"],
		["bg-sof-1", "Sofia", "BG", "EU"],
	],
	runpod: [
		["us-tx-3", "Dallas", "US", "NA"],
		["us-ga-1", "Atlanta", "US", "NA"],
		["ca-mtl-1", "Montreal", "CA", "NA"],
		["eu-ro-1", "Bucharest", "RO", "EU"],
		["eu-se-1", "Stockholm", "SE", "EU"],
	],
	lambda: [
		["us-east-1", "Virginia", "US", "NA"],
		["us-west-1", "California", "US", "NA"],
		["us-south-1", "Texas", "US", "NA"],
		["europe-central-1", "Frankfurt", "DE", "EU"],
		["asia-northeast-1", "Tokyo", "JP", "AS"],
	],
	vastai: [
		["us", "United States (marketplace)", "US", "NA"],
		["eu", "Europe (marketplace)", "NL", "EU"],
		["asia", "Asia (marketplace)", "SG", "AS"],
	],
	coreweave: [
		["us-east-04", "New Jersey", "US", "NA"],
		["us-central-01", "Chicago", "US", "NA"],
		["us-west-09", "Las Vegas", "US", "NA"],
		["eu-west-01", "London", "GB", "EU"],
	],
	paperspace: [
		["ny2", "New York", "US", "NA"],
		["ca1", "Santa Clara", "US", "NA"],
		["ams1", "Amsterdam", "NL", "EU"],
	],
	nebius: [
		["eu-north1", "Helsinki", "FI", "EU"],
		["eu-west1", "Paris", "FR", "EU"],
		["us-central1", "Kansas City", "US", "NA"],
	],
	hyperstack: [
		["canada-1", "Montreal", "CA", "NA"],
		["norway-1", "Oslo", "NO", "EU"],
		["us-1", "Iowa", "US", "NA"],
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
	upcloud: [
		["1xCPU-2GB", "1 vCPU / 2 GB", 1, 2, 50, 2, "shared", "x86", 10],
		["2xCPU-4GB", "2 vCPU / 4 GB", 2, 4, 80, 4, "shared", "x86", 20],
		["4xCPU-8GB", "4 vCPU / 8 GB", 4, 8, 160, 5, "shared", "x86", 40],
		["6xCPU-16GB", "6 vCPU / 16 GB", 6, 16, 320, 6, "shared", "x86", 80],
	],
	contabo: [
		["cloud-vps-10", "Cloud VPS 10", 4, 8, 75, 32, "shared", "x86", 5.5],
		["cloud-vps-20", "Cloud VPS 20", 6, 12, 100, 32, "shared", "x86", 9],
		["cloud-vps-30", "Cloud VPS 30", 8, 24, 200, 32, "shared", "x86", 17],
		["cloud-vds-s", "Cloud VDS S", 3, 24, 180, 32, "dedicated", "x86", 38],
	],
	civo: [
		["g3.xsmall", "Extra Small", 1, 1, 25, 1, "shared", "x86", 5.43],
		["g3.small", "Small", 1, 2, 25, 2, "shared", "x86", 10.86],
		["g3.medium", "Medium", 2, 4, 50, 3, "shared", "x86", 21.73],
		["g3.large", "Large", 4, 8, 100, 4, "shared", "x86", 43.45],
	],
	exoscale: [
		["standard.small", "Standard Small", 2, 2, 50, 0, "shared", "x86", 14],
		["standard.medium", "Standard Medium", 2, 4, 50, 0, "shared", "x86", 27],
		["standard.large", "Standard Large", 4, 8, 100, 0, "shared", "x86", 54],
		[
			"cpu.extra-large",
			"CPU Extra-Large",
			8,
			16,
			100,
			0,
			"dedicated",
			"x86",
			160,
		],
	],
	runpod: [],
	lambda: [],
	vastai: [],
	coreweave: [],
	paperspace: [],
	nebius: [],
	hyperstack: [],
};

type GpuPlanRow = [
	slug: string,
	name: string,
	gpuModel: string,
	gpuCount: number,
	vramGb: number,
	vcpu: number,
	memoryGb: number,
	diskGb: number,
	hourlyUsd: number,
	regions?: string[],
];

/** GPU clouds price by the hour; monthly is hourly × 730. */
const GPU_PLANS: Partial<Record<ProviderId, GpuPlanRow[]>> = {
	runpod: [
		["rtx4090", "RTX 4090", "RTX 4090", 1, 24, 6, 41, 100, 0.69],
		["l40s", "L40S", "L40S", 1, 48, 12, 62, 200, 0.86],
		["a100-80gb", "A100 PCIe 80GB", "A100 80GB", 1, 80, 8, 117, 200, 1.64],
		["h100-pcie", "H100 PCIe", "H100", 1, 80, 16, 188, 200, 2.39],
		["h100-sxm", "H100 SXM", "H100 SXM", 1, 80, 20, 251, 200, 2.69],
		["h200-sxm", "H200 SXM", "H200", 1, 141, 24, 276, 300, 3.59],
		["2x-a100-80gb", "2× A100 80GB", "A100 80GB", 2, 80, 16, 234, 400, 3.28],
	],
	lambda: [
		["gpu_1x_a10", "1× A10", "A10", 1, 24, 30, 200, 1400, 0.75],
		[
			"gpu_1x_a100_sxm4",
			"1× A100 40GB",
			"A100 40GB",
			1,
			40,
			30,
			200,
			512,
			1.29,
		],
		[
			"gpu_1x_gh200",
			"1× GH200",
			"GH200",
			1,
			96,
			64,
			432,
			4000,
			1.49,
			["us-east-1"],
		],
		["gpu_1x_h100_pcie", "1× H100 PCIe", "H100", 1, 80, 26, 200, 1000, 2.49],
		[
			"gpu_8x_a100_80gb_sxm4",
			"8× A100 80GB SXM",
			"A100 80GB",
			8,
			80,
			240,
			1800,
			20000,
			14.32,
		],
		[
			"gpu_8x_h100_sxm5",
			"8× H100 SXM",
			"H100 SXM",
			8,
			80,
			208,
			1800,
			24000,
			23.92,
		],
	],
	vastai: [
		["rtx3090", "RTX 3090 (marketplace)", "RTX 3090", 1, 24, 8, 32, 100, 0.22],
		["rtx4090", "RTX 4090 (marketplace)", "RTX 4090", 1, 24, 12, 64, 200, 0.38],
		[
			"a100-80gb",
			"A100 80GB (marketplace)",
			"A100 80GB",
			1,
			80,
			16,
			128,
			300,
			0.95,
		],
		[
			"h100-sxm",
			"H100 SXM (marketplace)",
			"H100 SXM",
			1,
			80,
			24,
			256,
			500,
			1.87,
		],
		[
			"4x-rtx4090",
			"4× RTX 4090 (marketplace)",
			"RTX 4090",
			4,
			24,
			48,
			256,
			800,
			1.55,
		],
	],
	coreweave: [
		["l40s", "L40S", "L40S", 1, 48, 16, 128, 512, 2.25],
		["a100-80gb", "A100 80GB", "A100 80GB", 1, 80, 15, 128, 512, 2.21],
		["8x-h100-hgx", "HGX H100 ×8", "H100 SXM", 8, 80, 128, 2048, 30000, 49.24],
	],
	paperspace: [
		["a4000", "A4000", "RTX A4000", 1, 16, 8, 45, 50, 0.76],
		["a6000", "A6000", "RTX A6000", 1, 48, 8, 45, 50, 1.89],
		["a100-80g", "A100-80G", "A100 80GB", 1, 80, 12, 90, 100, 3.18],
		["h100", "H100", "H100", 1, 80, 20, 250, 200, 5.95],
	],
	nebius: [
		["1gpu-l40s", "1× L40S", "L40S", 1, 48, 8, 32, 200, 1.55],
		["1gpu-h100", "1× H100", "H100 SXM", 1, 80, 16, 200, 200, 2.95],
		["1gpu-h200", "1× H200", "H200", 1, 141, 16, 200, 200, 3.5],
		["8gpu-h200", "8× H200", "H200", 8, 141, 128, 1600, 2000, 28],
	],
	hyperstack: [
		["rtx-a6000", "RTX A6000", "RTX A6000", 1, 48, 28, 58, 100, 0.5],
		["l40", "L40", "L40", 1, 48, 28, 58, 100, 1],
		["a100-80g-pcie", "A100 80GB PCIe", "A100 80GB", 1, 80, 28, 120, 100, 1.35],
		["h100-80g-pcie", "H100 PCIe", "H100", 1, 80, 28, 180, 100, 1.9],
		["h100-80g-sxm5", "H100 SXM", "H100 SXM", 1, 80, 24, 240, 100, 2.4],
	],
};

export function hourlyFromMonthlyMicros(
	provider: ProviderId,
	monthlyMicros: number,
): number {
	return Math.ceil(monthlyMicros / (MONTHLY_CAP_HOURS[provider] ?? 730));
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
	const cpu = PLANS[provider].map(
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
		]): Plan => {
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
	const gpu = (GPU_PLANS[provider] ?? []).map(
		([
			slug,
			name,
			model,
			count,
			vramGb,
			vcpu,
			memoryGb,
			diskGb,
			hourlyUsd,
			regions,
		]): Plan => ({
			id: `${provider}:${slug}`,
			provider,
			slug,
			name,
			vcpu,
			memoryGb,
			diskGb,
			transferTb: 0,
			cpuType: "dedicated",
			arch: "x86",
			priceHourlyMicros: Math.round(hourlyUsd * USD),
			priceMonthlyMicros: Math.round(hourlyUsd * 730 * USD),
			regions: regions ?? allRegions,
			gpu: { model, count, vramGb },
		}),
	);
	return [...cpu, ...gpu];
}
