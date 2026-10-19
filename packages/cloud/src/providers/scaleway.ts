import { createJsonClient } from "../http";
import { PROVIDER_IMAGES } from "../images";
import {
	type Arch,
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
	getOrGone,
	hostname,
	ignoreNotFound,
	isDefined,
	isNotFound,
	liveInfo,
	makeRegion,
	sendRaw,
	toMicros,
} from "./shared";

interface ScalewayConfig {
	secretKey: string;
	projectId: string;
	eurUsdRate: number;
}

interface SProduct {
	hourly_price: number;
	monthly_price: number;
	ncpus: number;
	ram: number;
	arch: string;
	volumes_constraint?: { min_size?: number; max_size?: number };
	end_of_service?: boolean;
	baremetal?: boolean;
	gpu?: number;
}

interface SImage {
	id: string;
	arch?: string;
	type?: string;
	compatible_commercial_types?: string[];
}

interface SVolume {
	id: string;
	volume_type: string;
}

interface SServer {
	id: string;
	state: string;
	public_ip?: { id?: string; address: string } | null;
	public_ips?: { id: string; address: string; family?: string }[];
	ipv6?: { address: string } | null;
	volumes?: Record<string, SVolume>;
}

const BASE = "https://api.scaleway.com";

const ZONES: [zone: string, city: string, country: string][] = [
	["fr-par-1", "Paris", "FR"],
	["fr-par-2", "Paris", "FR"],
	["fr-par-3", "Paris", "FR"],
	["nl-ams-1", "Amsterdam", "NL"],
	["nl-ams-2", "Amsterdam", "NL"],
	["nl-ams-3", "Amsterdam", "NL"],
	["pl-waw-1", "Warsaw", "PL"],
	["pl-waw-2", "Warsaw", "PL"],
	["pl-waw-3", "Warsaw", "PL"],
];

const STATUS: Record<string, ProviderServerStatus> = {
	starting: "provisioning",
	running: "running",
	stopping: "stopped",
	stopped: "stopped",
	"stopped in place": "stopped",
	locked: "error",
};

const POWER: Record<PowerAction, string> = {
	start: "poweron",
	stop: "poweroff",
	reboot: "reboot",
};

/**
 * Dedicated-vCPU families: POP2 (incl. -HC/-HM/-HN), ENT1 and COPARM1. DEV1, PLAY2,
 * STARDUST1, GP1 and PRO2 share vCPUs (PRO2 is "production-grade" but shared).
 */
const DEDICATED = /^(POP2|ENT1|COPARM1)-/;

const DEFAULT_DISK_BYTES = 20e9;

export function createScalewayAdapter(
	info: Omit<ProviderInfo, "mode">,
	config: ScalewayConfig,
	fetchImpl: typeof fetch = fetch,
): ProviderAdapter {
	const provider = info.id;
	const auth = { "X-Auth-Token": config.secretKey };
	const api = createJsonClient(provider, BASE, () => auth, fetchImpl);
	const zonePath = (zone: string) => `/instance/v1/zones/${zone}`;
	// Filled by listPlans; lets createServer size the root volume and guess the arch.
	const products = new Map<string, { arch: Arch; diskBytes: number }>();

	/** Products endpoints return maps keyed by commercial type, paginated with per_page/page. */
	async function pagedMap<T>(path: string): Promise<Record<string, T>> {
		const out: Record<string, T> = {};
		for (let page = 1; page <= 10; page++) {
			const res = await api<{ servers?: Record<string, T> }>({
				path,
				query: { per_page: 100, page },
			});
			const entries = Object.entries(res.servers ?? {});
			for (const [name, value] of entries) out[name] = value;
			if (entries.length < 100) break;
		}
		return out;
	}

	async function zoneProducts(zone: string) {
		const [offers, availability] = await Promise.all([
			pagedMap<SProduct>(`${zonePath(zone)}/products/servers`),
			// Advisory only: if it fails, assume everything is orderable.
			pagedMap<{ availability?: string }>(
				`${zonePath(zone)}/products/servers/availability`,
			).catch(() => ({})),
		]);
		return {
			zone,
			offers,
			availability: availability as Record<string, { availability?: string }>,
		};
	}

	function parseId(id: string) {
		const [zone, uuid] = id.split("/");
		if (!zone || !uuid)
			throw new ProviderError(provider, `invalid server id ${id}`, {
				status: 400,
			});
		return { zone, uuid };
	}

	const loadServer = async (zone: string, uuid: string) =>
		(
			await api<{ server: SServer }>({
				path: `${zonePath(zone)}/servers/${uuid}`,
			})
		).server;

	const action = (zone: string, uuid: string, name: string) =>
		api({
			method: "POST",
			path: `${zonePath(zone)}/servers/${uuid}/action`,
			body: { action: name },
		});

	async function pickImage(
		zone: string,
		commercialType: string,
		label: string,
	): Promise<SImage> {
		const res = await api<{ local_images?: SImage[] }>({
			path: "/marketplace/v2/local-images",
			query: { image_label: label, zone, per_page: 100 },
		});
		const arm =
			(products.get(commercialType)?.arch ??
				(/ARM/i.test(commercialType) ? "arm" : "x86")) === "arm";
		const fits = (res.local_images ?? []).filter((i) =>
			// Entries without a compatibility list fall back to an arch match.
			i.compatible_commercial_types
				? i.compatible_commercial_types.includes(commercialType)
				: (i.arch === "arm64") === arm,
		);
		// Prefer block-storage (SBS) images: newer types (POP2, PRO2...) can't boot from local volumes.
		const image = fits.find((i) => i.type === "instance_sbs") ?? fits[0];
		if (!image) {
			throw new ProviderError(
				provider,
				`no ${label} image for ${commercialType} in ${zone}`,
				{ retryable: true },
			);
		}
		return image;
	}

	/** Deletes an SBS volume, waiting for it to detach after the server goes away. */
	async function deleteBlockVolume(zone: string, volumeId: string) {
		for (let attempt = 0; ; attempt++) {
			try {
				await api({
					method: "DELETE",
					path: `/block/v1alpha1/zones/${zone}/volumes/${volumeId}`,
				});
				return;
			} catch (err) {
				if (isNotFound(err)) return;
				// 412/409 while the volume is still attached to the server being removed.
				const busy =
					err instanceof ProviderError && (err.retryable || err.status === 412);
				if (!busy || attempt >= 30) {
					throw new ProviderError(
						provider,
						`could not delete SBS volume ${zone}/${volumeId}: ${(err as Error).message}`,
					);
				}
				await new Promise((resolve) => setTimeout(resolve, 3_000));
			}
		}
	}

	async function deleteServer(id: string) {
		const { zone, uuid } = parseId(id);
		let server: SServer;
		try {
			server = await loadServer(zone, uuid);
		} catch (err) {
			if (isNotFound(err)) return;
			throw err;
		}
		const volumes = Object.values(server.volumes ?? {});
		if (server.state === "running") {
			// terminate removes the server, its local volumes and IPs, but only detaches SBS volumes.
			await action(zone, uuid, "terminate");
		} else if (server.state === "starting" || server.state === "stopping") {
			throw new ProviderError(
				provider,
				`server ${id} is ${server.state}; retry deletion shortly`,
				{ retryable: true },
			);
		} else {
			// terminate needs a running server; for a stopped one remove the pieces ourselves.
			await ignoreNotFound(
				api({ method: "DELETE", path: `${zonePath(zone)}/servers/${uuid}` }),
			);
			await Promise.all([
				...volumes
					.filter((v) => v.volume_type !== "sbs_volume")
					.map((v) =>
						ignoreNotFound(
							api({
								method: "DELETE",
								path: `${zonePath(zone)}/volumes/${v.id}`,
							}),
						),
					),
				...(server.public_ips ?? []).map((ip) =>
					ignoreNotFound(
						api({ method: "DELETE", path: `${zonePath(zone)}/ips/${ip.id}` }),
					),
				),
			]);
		}
		await Promise.all(
			volumes
				.filter((v) => v.volume_type === "sbs_volume")
				.map((v) => deleteBlockVolume(zone, v.id)),
		);
	}

	return {
		info: liveInfo(info),

		async listRegions() {
			return ZONES.map(([zone, city, country]) =>
				makeRegion(provider, zone, city, country, "EU"),
			).filter(isDefined);
		},

		async listPlans() {
			const settled = await Promise.allSettled(
				ZONES.map(([zone]) => zoneProducts(zone)),
			);
			const zones = settled.flatMap((s) =>
				s.status === "fulfilled" ? [s.value] : [],
			);
			if (!zones.length) {
				throw (
					(settled[0] as PromiseRejectedResult | undefined)?.reason ??
					new ProviderError(provider, "no zones")
				);
			}
			const plans = new Map<string, Plan>();
			for (const { zone, offers, availability } of zones) {
				for (const [name, p] of Object.entries(offers)) {
					const arch: Arch | undefined =
						p.arch === "arm64"
							? "arm"
							: p.arch === "x86_64"
								? "x86"
								: undefined;
					if (!arch || p.end_of_service || p.baremetal || (p.gpu ?? 0) > 0)
						continue;
					if (availability[name]?.availability === "shortage") continue;
					const hourly = toMicros(p.hourly_price * config.eurUsdRate, "ceil");
					const monthly = toMicros(p.monthly_price * config.eurUsdRate);
					const existing = plans.get(name);
					if (existing) {
						existing.regions.push(zone);
						existing.priceHourlyMicros = Math.min(
							existing.priceHourlyMicros,
							hourly,
						);
						existing.priceMonthlyMicros = Math.min(
							existing.priceMonthlyMicros,
							monthly,
						);
						continue;
					}
					// Types booting from SBS report min_size 0; the root volume is then billed separately
					// from the instance price (not included here), and we create it at 20 GB.
					const diskBytes =
						p.volumes_constraint?.min_size || DEFAULT_DISK_BYTES;
					products.set(name, { arch, diskBytes });
					plans.set(name, {
						id: `${provider}:${name}`,
						provider,
						slug: name,
						name,
						vcpu: p.ncpus,
						memoryGb: Math.round((p.ram / 2 ** 30) * 100) / 100,
						diskGb: Math.round(diskBytes / 1e9),
						// Instance egress is not metered against a quota.
						transferTb: 0,
						cpuType: DEDICATED.test(name) ? "dedicated" : "shared",
						arch,
						priceHourlyMicros: hourly,
						priceMonthlyMicros: monthly,
						regions: [zone],
					});
				}
			}
			return [...plans.values()];
		},

		createServer: (input) =>
			capacityAware(provider, async () => {
				const zone = input.regionSlug;
				const type = input.planSlug;
				const image = await pickImage(
					zone,
					type,
					PROVIDER_IMAGES.scaleway[input.image],
				);
				const local = image.type === "instance_local";
				// No IAM/project SSH keys: they are shared by every tenant; cloud-init carries the keys.
				const { server } = await api<{ server: SServer }>({
					method: "POST",
					path: `${zonePath(zone)}/servers`,
					body: {
						name: hostname(input.name),
						commercial_type: type,
						image: image.id,
						project: config.projectId,
						tags: ["switchyard", input.serverId],
						// Routed public IPv4 tied to the server's lifetime (IPv6 would need a separate flexible IP).
						dynamic_ip_required: true,
						volumes: {
							"0": {
								size: products.get(type)?.diskBytes ?? DEFAULT_DISK_BYTES,
								volume_type: local ? "l_ssd" : "sbs_volume",
							},
						},
					},
				});
				const id = `${zone}/${server.id}`;
				try {
					// This endpoint takes the raw cloud-init document, not JSON.
					await sendRaw(
						provider,
						fetchImpl,
						`${BASE}${zonePath(zone)}/servers/${server.id}/user_data/cloud-init`,
						{
							method: "PATCH",
							headers: { ...auth, "Content-Type": "text/plain" },
							body: input.userData,
						},
					);
					await action(zone, server.id, "poweron");
				} catch (err) {
					await deleteServer(id).catch(() => undefined);
					throw err;
				}
				return { ...toServer(server, zone), status: "provisioning" };
			}),

		getServer: (id) =>
			getOrGone(id, async () => {
				const { zone, uuid } = parseId(id);
				return toServer(await loadServer(zone, uuid), zone);
			}),

		deleteServer,

		async powerAction(id, power) {
			const { zone, uuid } = parseId(id);
			await action(zone, uuid, POWER[power]);
		},
	};
}

/** Server ids are zone-scoped, so ours are `${zone}/${uuid}`. */
function toServer(s: SServer, zone: string): ProviderServer {
	const ip = (family: string) =>
		s.public_ips?.find((i) => (i.family ?? "inet") === family)?.address;
	return {
		providerServerId: `${zone}/${s.id}`,
		status: STATUS[s.state] ?? "provisioning",
		ipv4: ip("inet") ?? s.public_ip?.address ?? null,
		ipv6: ip("inet6") ?? s.ipv6?.address ?? null,
	};
}
