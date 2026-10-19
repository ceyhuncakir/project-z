import { createJsonClient } from "../http";
import { providerImage } from "../images";
import {
	type Continent,
	type CreateServerInput,
	type Plan,
	type PowerAction,
	type ProviderAdapter,
	ProviderError,
	type ProviderInfo,
	type ProviderServer,
	type ProviderServerStatus,
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
	toMicros,
} from "./shared";

interface HetznerConfig {
	token: string;
	eurUsdRate: number;
}

type Page = { meta?: { pagination?: { next_page?: number | null } } } & Record<
	string,
	unknown
>;

interface HLocation {
	name: string;
	city: string;
	country: string;
	network_zone: string;
}

interface HPrice {
	location: string;
	price_hourly: { net: string };
	price_monthly: { net: string };
	included_traffic?: number;
}

interface HServerType {
	name: string;
	description?: string;
	cores: number;
	memory: number;
	disk: number;
	cpu_type: string;
	architecture?: string;
	deprecated?: boolean;
	deprecation?: unknown;
	prices: HPrice[];
	/** Legacy top-level field; newer responses carry it per location in `prices`. */
	included_traffic?: number;
	/** Newer API: per-location deprecation. */
	locations?: { name: string; deprecation?: unknown }[];
}

interface HServer {
	id: number;
	status: string;
	public_net?: { ipv4?: { ip: string } | null; ipv6?: { ip: string } | null };
}

const ZONE_CONTINENT: Record<string, Continent> = {
	"eu-central": "EU",
	"us-east": "NA",
	"us-west": "NA",
	"ap-southeast": "AS",
};

const STATUS: Record<string, ProviderServerStatus> = {
	initializing: "provisioning",
	starting: "provisioning",
	rebuilding: "provisioning",
	migrating: "provisioning",
	running: "running",
	stopping: "stopped",
	off: "stopped",
	deleting: "deleted",
	unknown: "error",
};

const POWER: Record<PowerAction, string> = {
	start: "poweron",
	stop: "shutdown",
	reboot: "reboot",
};

const TIB = 2 ** 40;

export function createHetznerAdapter(
	info: Omit<ProviderInfo, "mode">,
	config: HetznerConfig,
	fetchImpl: typeof fetch = fetch,
): ProviderAdapter {
	const provider = info.id;
	const api = createJsonClient(
		provider,
		"https://api.hetzner.cloud/v1",
		() => ({ Authorization: `Bearer ${config.token}` }),
		fetchImpl,
	);
	const eur = (amount: number, rounding: "round" | "ceil") =>
		toMicros(amount * config.eurUsdRate, rounding);

	async function list<T>(path: string, key: string): Promise<T[]> {
		const out: T[] = [];
		for (let page: number | null | undefined = 1, n = 0; page && n < 20; n++) {
			const res: Page = await api<Page>({
				path,
				query: { page, per_page: 50 },
			});
			out.push(...((res[key] as T[] | undefined) ?? []));
			page = res.meta?.pagination?.next_page;
		}
		return out;
	}

	async function create(
		input: CreateServerInput,
		name: string,
	): Promise<ProviderServer> {
		const { server } = await api<{ server: HServer }>({
			method: "POST",
			path: "/servers",
			body: {
				name,
				server_type: input.planSlug,
				location: input.regionSlug,
				image: providerImage("hetzner", input.image),
				// SSH keys travel in cloud-init: Hetzner `ssh_keys` live in the project, shared by every tenant.
				user_data: input.userData,
				labels: {
					"switchyard-id": input.serverId.replace(/[^\w.-]/g, "_").slice(0, 63),
				},
				start_after_create: true,
				public_net: { enable_ipv4: true, enable_ipv6: true },
			},
		});
		return toServer(server);
	}

	return {
		info: liveInfo(info),

		async listRegions() {
			const locations = await list<HLocation>("/locations", "locations");
			return locations
				.map((l) =>
					makeRegion(
						provider,
						l.name,
						l.city,
						l.country,
						ZONE_CONTINENT[l.network_zone] ?? continentOf(l.country),
					),
				)
				.filter(isDefined);
		},

		async listPlans() {
			const types = await list<HServerType>("/server_types", "server_types");
			return types.flatMap((t): Plan[] => {
				if (t.deprecated || t.deprecation) return [];
				const retired = new Set(
					(t.locations ?? []).filter((l) => l.deprecation).map((l) => l.name),
				);
				const prices = t.prices.filter((p) => !retired.has(p.location));
				const first = prices[0];
				if (!first) return [];
				// Prices differ per location (US/SG cost more): the base is the cheapest,
				// pricier locations go into regionPrices.
				const hourly = Math.min(
					...prices.map((p) => Number(p.price_hourly.net)),
				);
				const monthly = Math.min(
					...prices.map((p) => Number(p.price_monthly.net)),
				);
				const traffic = first.included_traffic ?? t.included_traffic ?? 0;
				return [
					{
						id: `${provider}:${t.name}`,
						provider,
						slug: t.name,
						name: t.description ?? t.name.toUpperCase(),
						vcpu: t.cores,
						memoryGb: t.memory,
						diskGb: t.disk,
						transferTb: Math.round((traffic / TIB) * 100) / 100,
						cpuType: t.cpu_type === "dedicated" ? "dedicated" : "shared",
						arch: t.architecture === "arm" ? "arm" : "x86",
						priceHourlyMicros: eur(hourly, "ceil"),
						priceMonthlyMicros: eur(monthly, "round"),
						regions: prices.map((p) => p.location),
						regionPrices: Object.fromEntries(
							prices
								.filter((p) => Number(p.price_hourly.net) !== hourly)
								.map((p) => [
									p.location,
									{
										hourlyMicros: eur(Number(p.price_hourly.net), "ceil"),
										monthlyMicros: eur(Number(p.price_monthly.net), "round"),
									},
								]),
						),
					},
				];
			});
		},

		createServer: (input) =>
			capacityAware(provider, async () => {
				const name = hostname(input.name);
				try {
					return await create(input, name);
				} catch (err) {
					// Server names are unique per project, and the project is shared by all tenants.
					const taken =
						err instanceof ProviderError &&
						/uniqueness_error/.test(err.message);
					if (!taken) throw err;
					return create(
						input,
						hostname(`${hostname(input.name, 32)}-${input.serverId}`),
					);
				}
			}),

		getServer: (id) =>
			getOrGone(id, async () =>
				toServer(
					(await api<{ server: HServer }>({ path: `/servers/${id}` })).server,
				),
			),

		deleteServer: (id) =>
			ignoreNotFound(api({ method: "DELETE", path: `/servers/${id}` })),

		async powerAction(id, action) {
			await api({
				method: "POST",
				path: `/servers/${id}/actions/${POWER[action]}`,
			});
		},
	};
}

function toServer(s: HServer): ProviderServer {
	const v6 = s.public_net?.ipv6?.ip;
	return {
		providerServerId: String(s.id),
		status: STATUS[s.status] ?? "provisioning",
		ipv4: s.public_net?.ipv4?.ip ?? null,
		// Hetzner reports the server's /64; the host itself answers on ::1 of it.
		ipv6: v6 ? v6.replace(/\/\d+$/, "").replace(/::$/, "::1") : null,
	};
}
