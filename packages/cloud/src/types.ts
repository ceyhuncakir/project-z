/**
 * Shared, provider-neutral types. Every provider adapter maps its own API
 * onto these shapes so the rest of the platform never sees provider quirks.
 *
 * Money is always integer micro-USD (1 USD = 1_000_000) to avoid float drift
 * when billing per minute.
 */

/** Providers with a live API adapter. */
export const LIVE_PROVIDER_IDS = [
	"hetzner",
	"digitalocean",
	"vultr",
	"linode",
	"ovhcloud",
	"scaleway",
] as const;

/** Providers that are simulated only, until their live adapters land. */
export const PREVIEW_PROVIDER_IDS = [
	"upcloud",
	"contabo",
	"civo",
	"exoscale",
	"runpod",
	"lambda",
	"vastai",
	"coreweave",
	"paperspace",
	"nebius",
	"hyperstack",
] as const;

export const PROVIDER_IDS = [
	...LIVE_PROVIDER_IDS,
	...PREVIEW_PROVIDER_IDS,
] as const;

export type LiveProviderId = (typeof LIVE_PROVIDER_IDS)[number];
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const CONTINENTS = ["EU", "NA", "SA", "AS", "OC", "AF"] as const;
export type Continent = (typeof CONTINENTS)[number];

export type CpuType = "shared" | "dedicated";
export type Arch = "x86" | "arm";

export type AdapterMode = "live" | "sandbox";

/** `cloud`: general-purpose VPS. `gpu`: GPU clouds for training and LLM hosting. */
export type ProviderCategory = "cloud" | "gpu";

export interface ProviderInfo {
	id: ProviderId;
	name: string;
	website: string;
	category: ProviderCategory;
	/** Simulated only: no live adapter exists yet. */
	preview: boolean;
	/** "live" when platform credentials are configured, otherwise "sandbox". */
	mode: AdapterMode;
}

export interface Region {
	/** Globally unique: `${provider}:${slug}` */
	id: string;
	provider: ProviderId;
	/** Provider-native identifier, e.g. `fsn1`, `ams3`. */
	slug: string;
	city: string;
	/** ISO 3166-1 alpha-2 */
	country: string;
	continent: Continent;
}

export interface Plan {
	/** Globally unique: `${provider}:${slug}` */
	id: string;
	provider: ProviderId;
	/** Provider-native identifier, e.g. `cx22`, `s-2vcpu-4gb`. */
	slug: string;
	name: string;
	vcpu: number;
	memoryGb: number;
	diskGb: number;
	/** Included egress per month, TB. 0 when metered. */
	transferTb: number;
	cpuType: CpuType;
	arch: Arch;
	/** Lowest price across the plan's regions ("from" price). */
	priceHourlyMicros: number;
	priceMonthlyMicros: number;
	/** Region slugs (provider-native) where the plan can be ordered. */
	regions: string[];
	/** Regions priced differently from the base price, keyed by region slug. */
	regionPrices?: Record<
		string,
		{ hourlyMicros: number; monthlyMicros: number }
	>;
	/** Attached accelerators. Absent on CPU-only plans. */
	gpu?: GpuSpec;
}

export interface GpuSpec {
	/** Marketing name, e.g. "H100 SXM". */
	model: string;
	count: number;
	/** Memory per GPU, GB. */
	vramGb: number;
}

export const IMAGE_IDS = [
	"ubuntu-24.04",
	"ubuntu-22.04",
	"debian-12",
	"rocky-9",
	"ubuntu-22.04-cuda",
] as const;
export type ImageId = (typeof IMAGE_IDS)[number];

export interface Image {
	id: ImageId;
	name: string;
	family: "ubuntu" | "debian" | "rocky";
	/** Ships NVIDIA drivers + CUDA; only valid on GPU plans. */
	gpu?: boolean;
}

export type ProviderServerStatus =
	| "provisioning"
	| "running"
	| "stopped"
	| "deleted"
	| "error";

export interface CreateServerInput {
	/** Our server id; adapters should use it as a label/tag where supported. */
	serverId: string;
	name: string;
	regionSlug: string;
	planSlug: string;
	image: ImageId;
	sshPublicKeys: string[];
	/**
	 * Fully assembled cloud-init payload (already contains the SSH keys).
	 * Adapters that support cloud-init should pass it through verbatim.
	 */
	userData: string;
}

export interface ProviderServer {
	providerServerId: string;
	status: ProviderServerStatus;
	ipv4: string | null;
	ipv6: string | null;
}

export type PowerAction = "start" | "stop" | "reboot";

export interface ProviderAdapter {
	readonly info: ProviderInfo;
	listRegions(): Promise<Region[]>;
	listPlans(): Promise<Plan[]>;
	createServer(input: CreateServerInput): Promise<ProviderServer>;
	getServer(providerServerId: string): Promise<ProviderServer>;
	deleteServer(providerServerId: string): Promise<void>;
	powerAction(providerServerId: string, action: PowerAction): Promise<void>;
}

/**
 * Thrown by adapters. `retryable` tells the router it may fall back to the
 * next candidate plan (capacity, quota, transient upstream errors).
 */
export class ProviderError extends Error {
	readonly provider: ProviderId;
	readonly retryable: boolean;
	readonly status?: number;

	constructor(
		provider: ProviderId,
		message: string,
		opts: { retryable?: boolean; status?: number } = {},
	) {
		super(`[${provider}] ${message}`);
		this.name = "ProviderError";
		this.provider = provider;
		this.retryable = opts.retryable ?? false;
		this.status = opts.status;
	}
}
