import { createJsonClient } from "../http";
import { providerImage } from "../images";
import { referenceRegions } from "../reference-catalog";
import type {
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
	ignoreNotFound,
	isDefined,
	liveInfo,
	makeRegion,
	randomPassword,
	toBase64,
	toMicros,
} from "./shared";

interface LinodeConfig {
	token: string;
}

interface Page<T> {
	data: T[];
	page: number;
	pages: number;
}

interface LRegion {
	id: string;
	label: string;
	country: string;
	status: string;
	capabilities: string[];
}

interface LType {
	id: string;
	label: string;
	class: string;
	vcpus: number;
	memory: number;
	disk: number;
	transfer: number;
	price: { hourly: number; monthly: number };
	/** Surcharged regions, e.g. id-cgk, br-gru. */
	region_prices?: { id: string; hourly: number; monthly: number }[];
}

interface LInstance {
	id: number;
	status: string;
	ipv4?: string[];
	ipv6?: string | null;
}

/** Compute classes we sell; gpu/accelerated are excluded. */
const CLASSES = new Set([
	"nanode",
	"standard",
	"dedicated",
	"highmem",
	"premium",
]);
const DEDICATED = new Set(["dedicated", "premium"]);

const STATUS: Record<string, ProviderServerStatus> = {
	provisioning: "provisioning",
	booting: "provisioning",
	rebuilding: "provisioning",
	migrating: "provisioning",
	cloning: "provisioning",
	restoring: "provisioning",
	resizing: "provisioning",
	running: "running",
	rebooting: "running",
	offline: "stopped",
	shutting_down: "stopped",
	stopped: "stopped",
	deleting: "deleted",
};

const POWER: Record<PowerAction, string> = {
	start: "boot",
	stop: "shutdown",
	reboot: "reboot",
};

const PRIVATE_V4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function createLinodeAdapter(
	info: Omit<ProviderInfo, "mode">,
	config: LinodeConfig,
	fetchImpl: typeof fetch = fetch,
): ProviderAdapter {
	const provider = info.id;
	const api = createJsonClient(
		provider,
		"https://api.linode.com/v4",
		() => ({ Authorization: `Bearer ${config.token}` }),
		fetchImpl,
	);
	const known = new Map(referenceRegions(provider).map((r) => [r.slug, r]));

	async function list<T>(path: string): Promise<T[]> {
		const out: T[] = [];
		for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
			const res = await api<Page<T>>({ path, query: { page, page_size: 500 } });
			out.push(...res.data);
			pages = res.pages;
		}
		return out;
	}

	// Compute regions, shared by listRegions/listPlans and the per-region Metadata (cloud-init) check.
	let regions: Promise<LRegion[]> | undefined;
	function loadRegions(): Promise<LRegion[]> {
		const load = list<LRegion>("/regions").then((all) =>
			all.filter(
				(r) => r.status === "ok" && r.capabilities.includes("Linodes"),
			),
		);
		regions = load.catch((err) => {
			regions = undefined;
			throw err;
		});
		return regions;
	}

	async function supportsMetadata(slug: string): Promise<boolean> {
		const cached = (await regions?.catch(() => undefined))?.find(
			(r) => r.id === slug,
		);
		const region = cached ?? (await api<LRegion>({ path: `/regions/${slug}` }));
		return region.capabilities.includes("Metadata");
	}

	return {
		info: liveInfo(info),

		async listRegions() {
			return (await loadRegions())
				.map((r) => {
					const country =
						r.country.toUpperCase() === "UK" ? "GB" : r.country.toUpperCase();
					const city =
						known.get(r.id)?.city ?? r.label.split(",")[0]?.trim() ?? r.id;
					return makeRegion(provider, r.id, city, country);
				})
				.filter(isDefined);
		},

		async listPlans() {
			const [types, available] = await Promise.all([
				list<LType>("/linode/types"),
				regions ?? loadRegions(),
			]);
			const regionIds = available.map((r) => r.id);
			return types
				.filter((t) => CLASSES.has(t.class))
				.map(
					(t): Plan => ({
						id: `${provider}:${t.id}`,
						provider,
						slug: t.id,
						name: t.label,
						vcpu: t.vcpus,
						memoryGb: t.memory / 1024,
						diskGb: Math.round(t.disk / 1024),
						transferTb: t.transfer / 1000,
						cpuType: DEDICATED.has(t.class) ? "dedicated" : "shared",
						arch: "x86",
						priceHourlyMicros: toMicros(t.price.hourly, "ceil"),
						priceMonthlyMicros: toMicros(t.price.monthly),
						regions: regionIds,
						regionPrices: Object.fromEntries(
							(t.region_prices ?? []).map((rp) => [
								rp.id,
								{
									hourlyMicros: toMicros(rp.hourly, "ceil"),
									monthlyMicros: toMicros(rp.monthly),
								},
							]),
						),
					}),
				);
		},

		createServer: (input) =>
			capacityAware(provider, async () => {
				// Metadata (cloud-init) only exists in some regions; authorized_keys (per instance) covers SSH elsewhere.
				const metadata = await supportsMetadata(input.regionSlug);
				const instance = await api<LInstance>({
					method: "POST",
					path: "/linode/instances",
					body: {
						label: label(input.serverId),
						region: input.regionSlug,
						type: input.planSlug,
						image: providerImage("linode", input.image),
						// Required with an image; random and never stored. Password SSH is disabled by cloud-init.
						root_pass: randomPassword(),
						authorized_keys: input.sshPublicKeys,
						...(metadata
							? { metadata: { user_data: toBase64(input.userData) } }
							: {}),
						tags: ["switchyard"],
						booted: true,
					},
				});
				return toServer(instance);
			}),

		getServer: (id) =>
			getOrGone(id, async () =>
				toServer(await api<LInstance>({ path: `/linode/instances/${id}` })),
			),

		deleteServer: (id) =>
			ignoreNotFound(
				api({ method: "DELETE", path: `/linode/instances/${id}` }),
			),

		async powerAction(id, action) {
			await api({
				method: "POST",
				path: `/linode/instances/${id}/${POWER[action]}`,
				body: {},
			});
		},
	};
}

/** Labels are unique per account: 3-64 chars, start with a letter, no `--`/`__`/`..`. */
function label(serverId: string): string {
	return `sy-${serverId}`
		.replace(/[^a-zA-Z0-9_.-]/g, "-")
		.replace(/[-_.]{2,}/g, "-")
		.slice(0, 64);
}

function toServer(l: LInstance): ProviderServer {
	return {
		providerServerId: String(l.id),
		status: STATUS[l.status] ?? "provisioning",
		ipv4: l.ipv4?.find((ip) => !PRIVATE_V4.test(ip)) ?? null,
		ipv6: l.ipv6 ? l.ipv6.replace(/\/\d+$/, "") : null,
	};
}
