import { createJsonClient } from "../http";
import { providerImage } from "../images";
import type {
	Continent,
	Plan,
	PowerAction,
	ProviderAdapter,
	ProviderInfo,
	ProviderServer,
	ProviderServerStatus,
} from "../types";
import {
	capacityAware,
	getOrGone,
	hostname,
	ignoreNotFound,
	isDefined,
	liveInfo,
	makeRegion,
	toMicros,
} from "./shared";

interface DigitalOceanConfig {
	token: string;
}

type Page = { links?: { pages?: { next?: string } } } & Record<string, unknown>;

interface DORegion {
	slug: string;
	name: string;
	available: boolean;
}

interface DOSize {
	slug: string;
	description?: string;
	vcpus: number;
	memory: number;
	disk: number;
	transfer: number;
	price_hourly: number;
	price_monthly: number;
	regions: string[];
	available: boolean;
	gpu_info?: unknown;
}

interface DONetwork {
	ip_address: string;
	type: string;
}

interface DODroplet {
	id: number;
	status: string;
	networks?: { v4?: DONetwork[]; v6?: DONetwork[] };
}

/** Region slug prefix (nyc1 → nyc) → location. */
const LOCATIONS: Record<
	string,
	[city: string, country: string, continent: Continent]
> = {
	nyc: ["New York", "US", "NA"],
	sfo: ["San Francisco", "US", "NA"],
	atl: ["Atlanta", "US", "NA"],
	tor: ["Toronto", "CA", "NA"],
	ams: ["Amsterdam", "NL", "EU"],
	fra: ["Frankfurt", "DE", "EU"],
	lon: ["London", "GB", "EU"],
	sgp: ["Singapore", "SG", "AS"],
	blr: ["Bangalore", "IN", "AS"],
	syd: ["Sydney", "AU", "OC"],
};

const STATUS: Record<string, ProviderServerStatus> = {
	new: "provisioning",
	active: "running",
	off: "stopped",
	archive: "deleted",
};

const POWER: Record<PowerAction, string> = {
	start: "power_on",
	stop: "shutdown",
	reboot: "reboot",
};

const DEDICATED_DESCRIPTION =
	/CPU-Optimized|General Purpose|Memory-Optimized|Storage-Optimized/i;
const DEDICATED_SLUG = /^(c|c2|g|gd|m|m3|m6|so|so1_5)-/;

export function createDigitalOceanAdapter(
	info: Omit<ProviderInfo, "mode">,
	config: DigitalOceanConfig,
	fetchImpl: typeof fetch = fetch,
): ProviderAdapter {
	const provider = info.id;
	const api = createJsonClient(
		provider,
		"https://api.digitalocean.com/v2",
		() => ({ Authorization: `Bearer ${config.token}` }),
		fetchImpl,
	);

	async function list<T>(path: string, key: string): Promise<T[]> {
		const out: T[] = [];
		for (let page = 1; page <= 20; page++) {
			const res = await api<Page>({ path, query: { page, per_page: 200 } });
			out.push(...((res[key] as T[] | undefined) ?? []));
			if (!res.links?.pages?.next) break;
		}
		return out;
	}

	return {
		info: liveInfo(info),

		async listRegions() {
			const regions = await list<DORegion>("/regions", "regions");
			return regions
				.filter((r) => r.available)
				.map((r) => {
					// Unknown prefixes are skipped rather than guessed; extend LOCATIONS when DO opens a region.
					const loc = LOCATIONS[r.slug.replace(/\d+$/, "")];
					return loc
						? makeRegion(provider, r.slug, loc[0], loc[1], loc[2])
						: undefined;
				})
				.filter(isDefined);
		},

		async listPlans() {
			const sizes = await list<DOSize>("/sizes", "sizes");
			return sizes.flatMap((s): Plan[] => {
				if (!s.available || s.gpu_info || s.slug.startsWith("gpu-")) return [];
				const memoryGb = s.memory / 1024;
				const dedicated =
					DEDICATED_DESCRIPTION.test(s.description ?? "") ||
					DEDICATED_SLUG.test(s.slug);
				return [
					{
						id: `${provider}:${s.slug}`,
						provider,
						slug: s.slug,
						name: `${s.description ?? "Droplet"} ${s.vcpus} vCPU / ${memoryGb} GB`,
						vcpu: s.vcpus,
						memoryGb,
						diskGb: s.disk,
						transferTb: s.transfer,
						cpuType: dedicated ? "dedicated" : "shared",
						arch: "x86",
						priceHourlyMicros: toMicros(s.price_hourly, "ceil"),
						priceMonthlyMicros: toMicros(s.price_monthly),
						regions: s.regions,
					},
				];
			});
		},

		createServer: (input) =>
			capacityAware(provider, async () => {
				// No `ssh_keys`: DO keys are account-wide (shared by all tenants), so cloud-init carries them.
				// Side effect: DO emails a root password to the account owner (password SSH is off via cloud-init).
				const { droplet } = await api<{ droplet: DODroplet }>({
					method: "POST",
					path: "/droplets",
					body: {
						name: hostname(input.name),
						region: input.regionSlug,
						size: input.planSlug,
						image: providerImage("digitalocean", input.image),
						user_data: input.userData,
						ipv6: true,
						tags: [
							"switchyard",
							`switchyard-${input.serverId.replace(/[^a-zA-Z0-9_:-]/g, "_")}`,
						],
					},
				});
				return toServer(droplet);
			}),

		getServer: (id) =>
			getOrGone(id, async () =>
				toServer(
					(await api<{ droplet: DODroplet }>({ path: `/droplets/${id}` }))
						.droplet,
				),
			),

		deleteServer: (id) =>
			ignoreNotFound(api({ method: "DELETE", path: `/droplets/${id}` })),

		async powerAction(id, action) {
			await api({
				method: "POST",
				path: `/droplets/${id}/actions`,
				body: { type: POWER[action] },
			});
		},
	};
}

function toServer(d: DODroplet): ProviderServer {
	const pub = (nets?: DONetwork[]) =>
		nets?.find((n) => n.type === "public")?.ip_address ?? null;
	return {
		providerServerId: String(d.id),
		status: STATUS[d.status] ?? "provisioning",
		ipv4: pub(d.networks?.v4),
		ipv6: pub(d.networks?.v6),
	};
}
