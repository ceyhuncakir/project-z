import { createJsonClient } from "../http";
import { PROVIDER_IMAGES } from "../images";
import { hourlyFromMonthlyMicros } from "../reference-catalog";
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
	continentOf,
	getOrGone,
	hostname,
	ignoreNotFound,
	isDefined,
	liveInfo,
	makeRegion,
	toBase64,
	toMicros,
} from "./shared";

interface VultrConfig {
	apiKey: string;
}

type Page = { meta?: { links?: { next?: string } } } & Record<string, unknown>;

interface VRegion {
	id: string;
	city: string;
	country: string;
	continent: string;
}

interface VPlan {
	id: string;
	type: string;
	vcpu_count: number;
	ram: number;
	disk: number;
	bandwidth: number;
	monthly_cost: number;
	/** Not on every API version; derived from the monthly cap when absent. */
	hourly_cost?: number;
	locations: string[];
}

interface VInstance {
	id: string;
	status: string;
	power_status?: string;
	server_status?: string;
	main_ip?: string;
	v6_main_ip?: string;
}

const CONTINENTS: Record<string, Continent> = {
	Europe: "EU",
	"North America": "NA",
	"South America": "SA",
	Asia: "AS",
	Australia: "OC",
	Oceania: "OC",
	Africa: "AF",
};

/** Cloud compute plan families; GPU (vcg) and bare metal are left out. */
const TYPES: Record<string, string> = {
	vc2: "Regular",
	vhf: "High Frequency",
	vhp: "High Performance",
	voc: "Optimized",
	vdc: "Dedicated",
};

const POWER: Record<PowerAction, string> = {
	start: "start",
	stop: "halt",
	reboot: "reboot",
};

export function createVultrAdapter(
	info: Omit<ProviderInfo, "mode">,
	config: VultrConfig,
	fetchImpl: typeof fetch = fetch,
): ProviderAdapter {
	const provider = info.id;
	const api = createJsonClient(
		provider,
		"https://api.vultr.com/v2",
		() => ({ Authorization: `Bearer ${config.apiKey}` }),
		fetchImpl,
	);

	async function list<T>(path: string, key: string): Promise<T[]> {
		const out: T[] = [];
		let cursor: string | undefined;
		for (let n = 0; n < 20; n++) {
			const res = await api<Page>({ path, query: { per_page: 500, cursor } });
			out.push(...((res[key] as T[] | undefined) ?? []));
			cursor = res.meta?.links?.next || undefined;
			if (!cursor) break;
		}
		return out;
	}

	return {
		info: liveInfo(info),

		async listRegions() {
			const regions = await list<VRegion>("/regions", "regions");
			return regions
				.map((r) =>
					makeRegion(
						provider,
						r.id,
						r.city,
						r.country,
						CONTINENTS[r.continent] ?? continentOf(r.country),
					),
				)
				.filter(isDefined);
		},

		async listPlans() {
			const plans = await list<VPlan>("/plans", "plans");
			return plans.flatMap((p): Plan[] => {
				const family = TYPES[p.type];
				if (!family || !p.locations?.length) return [];
				const monthly = toMicros(p.monthly_cost);
				const memoryGb = p.ram / 1024;
				return [
					{
						id: `${provider}:${p.id}`,
						provider,
						slug: p.id,
						name: `${family} ${p.vcpu_count} vCPU / ${memoryGb} GB`,
						vcpu: p.vcpu_count,
						memoryGb,
						diskGb: p.disk,
						// Vultr lists bandwidth in GB with 1 TB = 1024.
						transferTb: Math.round((p.bandwidth / 1024) * 100) / 100,
						cpuType:
							p.type === "voc" || p.type === "vdc" ? "dedicated" : "shared",
						arch: p.id.includes("arm") ? "arm" : "x86",
						priceHourlyMicros: p.hourly_cost
							? toMicros(p.hourly_cost, "ceil")
							: hourlyFromMonthlyMicros(provider, monthly),
						priceMonthlyMicros: monthly,
						regions: p.locations,
					},
				];
			});
		},

		createServer: (input) =>
			capacityAware(provider, async () => {
				// No `sshkey_id`: Vultr keys are account-wide, so cloud-init carries them.
				const { instance } = await api<{ instance: VInstance }>({
					method: "POST",
					path: "/instances",
					body: {
						region: input.regionSlug,
						plan: input.planSlug,
						os_id: Number(PROVIDER_IMAGES.vultr[input.image]),
						label: input.name,
						hostname: hostname(input.name),
						user_data: toBase64(input.userData),
						enable_ipv6: true,
						tags: ["switchyard", input.serverId],
					},
				});
				// The response also carries `default_password`; it is deliberately dropped.
				return toServer(instance);
			}),

		getServer: (id) =>
			getOrGone(id, async () =>
				toServer(
					(await api<{ instance: VInstance }>({ path: `/instances/${id}` }))
						.instance,
				),
			),

		deleteServer: (id) =>
			ignoreNotFound(api({ method: "DELETE", path: `/instances/${id}` })),

		async powerAction(id, action) {
			await api({ method: "POST", path: `/instances/${id}/${POWER[action]}` });
		},
	};
}

function status(i: VInstance): ProviderServerStatus {
	if (i.status === "pending" || i.status === "resizing") return "provisioning";
	if (i.status === "suspended" || i.power_status === "stopped")
		return "stopped";
	// `active` is reported as soon as the instance is allocated; the OS is up once server_status leaves these.
	if (i.server_status === "none" || i.server_status === "installingbooting")
		return "provisioning";
	return "running";
}

function toServer(i: VInstance): ProviderServer {
	return {
		providerServerId: i.id,
		status: status(i),
		ipv4: i.main_ip && i.main_ip !== "0.0.0.0" ? i.main_ip : null,
		ipv6: i.v6_main_ip && i.v6_main_ip !== "::" ? i.v6_main_ip : null,
	};
}
