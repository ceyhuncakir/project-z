import { createHash } from "node:crypto";

import { providerImage } from "../images";
import { referencePlans, referenceRegions } from "../reference-catalog";
import {
	type Continent,
	type Plan,
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
	liveInfo,
	makeRegion,
	sendRaw,
	toMicros,
} from "./shared";

interface OvhConfig {
	/** `ovh-eu`, `ovh-ca`, `ovh-us`, or a full API base URL. */
	endpoint: string;
	applicationKey: string;
	applicationSecret: string;
	consumerKey: string;
	projectId: string;
	eurUsdRate: number;
}

interface OFlavor {
	id: string;
	name: string;
	region: string;
	vcpus: number;
	ram: number;
	disk: number;
	osType: string;
	available: boolean;
	planCodes?: { hourly?: string | null; monthly?: string | null };
}

interface OImage {
	id: string;
	name: string;
	status?: string;
	flavorType?: string | null;
}

interface OInstance {
	id: string;
	status: string;
	ipAddresses?: { ip: string; type: string; version: number }[];
}

interface OCatalog {
	locale?: { currencyCode?: string };
	addons?: {
		planCode: string;
		pricings?: { price: number; capacities?: string[] }[];
	}[];
}

const ENDPOINTS: Record<string, string> = {
	"ovh-eu": "https://eu.api.ovh.com/1.0",
	"ovh-ca": "https://ca.api.ovh.com/1.0",
	"ovh-us": "https://api.us.ovhcloud.com/1.0",
};

/** Region name without its trailing number (GRA11 → GRA, US-EAST-VA-1 → US-EAST-VA) → location. */
const LOCATIONS: Record<
	string,
	[city: string, country: string, continent: Continent]
> = {
	GRA: ["Gravelines", "FR", "EU"],
	SBG: ["Strasbourg", "FR", "EU"],
	RBX: ["Roubaix", "FR", "EU"],
	"EU-WEST-PAR": ["Paris", "FR", "EU"],
	DE: ["Frankfurt", "DE", "EU"],
	UK: ["London", "GB", "EU"],
	WAW: ["Warsaw", "PL", "EU"],
	"EU-SOUTH-MIL": ["Milan", "IT", "EU"],
	BHS: ["Beauharnois", "CA", "NA"],
	"CA-EAST-TOR": ["Toronto", "CA", "NA"],
	"US-EAST-VA": ["Vint Hill", "US", "NA"],
	"US-WEST-OR": ["Hillsboro", "US", "NA"],
	SGP: ["Singapore", "SG", "AS"],
	"AP-SOUTHEAST-SGP": ["Singapore", "SG", "AS"],
	"AP-SOUTH-MUM": ["Mumbai", "IN", "AS"],
	SYD: ["Sydney", "AU", "OC"],
	"AP-SOUTHEAST-SYD": ["Sydney", "AU", "OC"],
};

const FAMILIES: Record<string, string> = {
	b: "General Purpose",
	c: "Compute",
	d: "Discovery",
	i: "IOPS",
	r: "Memory",
	s: "Sandbox",
};

/** Discovery (d2) and Sandbox (s1) share vCPUs; every other family has guaranteed (dedicated) resources. */
const SHARED = /^(d2|s1)-/;
const GPU = /^(t\d|l4|l40s|a10|a100|h100|h200|rtx)/i;

const STATUS: Record<string, ProviderServerStatus> = {
	BUILD: "provisioning",
	REBUILD: "provisioning",
	RESIZE: "provisioning",
	VERIFY_RESIZE: "provisioning",
	MIGRATING: "provisioning",
	ACTIVE: "running",
	REBOOT: "running",
	HARD_REBOOT: "running",
	SHUTOFF: "stopped",
	STOPPED: "stopped",
	SHELVED: "stopped",
	SHELVED_OFFLOADED: "stopped",
	SUSPENDED: "stopped",
	PAUSED: "stopped",
	DELETING: "deleted",
	DELETED: "deleted",
	ERROR: "error",
};

/** Hourly instances are billed per hour with no monthly cap. */
const HOURS_PER_MONTH = 730;

/** `$1$` + sha1(AS+CK+METHOD+URL+BODY+TIMESTAMP), per the OVH API signing scheme. */
export function ovhSignature(input: {
	applicationSecret: string;
	consumerKey: string;
	method: string;
	url: string;
	body: string;
	timestamp: number | string;
}): string {
	const { applicationSecret, consumerKey, method, url, body, timestamp } =
		input;
	const payload = [
		applicationSecret,
		consumerKey,
		method,
		url,
		body,
		timestamp,
	].join("+");
	return `$1$${createHash("sha1").update(payload).digest("hex")}`;
}

export function createOvhAdapter(
	info: Omit<ProviderInfo, "mode">,
	config: OvhConfig,
	fetchImpl: typeof fetch = fetch,
): ProviderAdapter {
	const provider = info.id;
	const base = (ENDPOINTS[config.endpoint] ?? config.endpoint).replace(
		/\/$/,
		"",
	);
	if (!/^https?:\/\//.test(base))
		throw new ProviderError(
			provider,
			`unknown OVH endpoint "${config.endpoint}"`,
		);
	// Catalog prices are per subsidiary. ovh-ca serves several; WS ("world") quotes USD.
	const subsidiary = base.includes("ca.api.ovh")
		? "WS"
		: base.includes("api.us.ovhcloud")
			? "US"
			: "FR";
	const project = `/cloud/project/${config.projectId}`;
	const regionRef = new Map(referenceRegions(provider).map((r) => [r.slug, r]));
	const planRef = new Map(referencePlans(provider).map((p) => [p.slug, p]));

	let skew: Promise<number> | undefined;
	/** Signatures must use OVH's clock, so measure the offset once. */
	function clockSkew(): Promise<number> {
		skew ??= request<number>("GET", "/auth/time", { signed: false })
			.then((serverTime) => serverTime - Math.floor(Date.now() / 1000))
			.catch((err) => {
				skew = undefined;
				throw err;
			});
		return skew;
	}

	async function request<T>(
		method: "GET" | "POST" | "DELETE",
		path: string,
		opts: {
			query?: Record<string, string>;
			body?: unknown;
			signed?: boolean;
		} = {},
	): Promise<T> {
		const url = new URL(base + path);
		for (const [k, v] of Object.entries(opts.query ?? {}))
			url.searchParams.set(k, v);
		const body = opts.body === undefined ? "" : JSON.stringify(opts.body);
		const headers: Record<string, string> = {
			Accept: "application/json",
			"X-Ovh-Application": config.applicationKey,
			...(body ? { "Content-Type": "application/json" } : {}),
		};
		if (opts.signed !== false) {
			const timestamp = Math.floor(Date.now() / 1000) + (await clockSkew());
			headers["X-Ovh-Consumer"] = config.consumerKey;
			headers["X-Ovh-Timestamp"] = String(timestamp);
			headers["X-Ovh-Signature"] = ovhSignature({
				applicationSecret: config.applicationSecret,
				consumerKey: config.consumerKey,
				method,
				url: url.toString(),
				body,
				timestamp,
			});
		}
		const text = await sendRaw(provider, fetchImpl, url, {
			method,
			headers,
			body: body || undefined,
		});
		return (text ? JSON.parse(text) : undefined) as T;
	}

	/** planCode → hourly micro-USD, from the public order catalog. */
	async function hourlyPrices(): Promise<Map<string, number>> {
		// Public endpoint: left unsigned so the consumer key needs no /order/* access rule.
		const catalog = await request<OCatalog>(
			"GET",
			"/order/catalog/public/cloud",
			{
				query: { ovhSubsidiary: subsidiary },
				signed: false,
			},
		);
		const rates: Record<string, number> = { EUR: config.eurUsdRate, USD: 1 };
		const rate = rates[catalog.locale?.currencyCode ?? "EUR"];
		const prices = new Map<string, number>();
		if (!rate) return prices;
		for (const addon of catalog.addons ?? []) {
			const pricing = addon.pricings?.find((p) =>
				p.capacities?.includes("consumption"),
			);
			// Catalog prices are integers in 1e-8 currency units: 990000 = 0.0099 per hour.
			if (pricing?.price)
				prices.set(
					addon.planCode,
					toMicros((pricing.price / 1e8) * rate, "ceil"),
				);
		}
		return prices;
	}

	return {
		info: liveInfo(info),

		async verify() {
			await request("GET", project);
		},

		async listRegions() {
			const names = await request<string[]>("GET", `${project}/region`);
			return names
				.map((name) => {
					const known = regionRef.get(name);
					if (known) return known;
					const loc = LOCATIONS[name.replace(/-?\d+$/, "")];
					return loc
						? makeRegion(provider, name, loc[0], loc[1], loc[2])
						: undefined;
				})
				.filter(isDefined);
		},

		async listPlans() {
			const [flavors, prices] = await Promise.all([
				request<OFlavor[]>("GET", `${project}/flavor`),
				hourlyPrices().catch(() => new Map<string, number>()),
			]);
			// Flavors are listed once per region; fold them into one plan per name.
			const groups = new Map<
				string,
				{ flavor: OFlavor; regions: Set<string> }
			>();
			for (const f of flavors) {
				if (!f.available || f.osType !== "linux" || GPU.test(f.name)) continue;
				const group = groups.get(f.name);
				if (group) group.regions.add(f.region);
				else groups.set(f.name, { flavor: f, regions: new Set([f.region]) });
			}
			return [...groups.values()].flatMap(({ flavor: f, regions }): Plan[] => {
				const priced = f.planCodes?.hourly
					? prices.get(f.planCodes.hourly)
					: undefined;
				const fallback = planRef.get(f.name);
				const hourly = priced ?? fallback?.priceHourlyMicros;
				if (!hourly) return [];
				return [
					{
						id: `${provider}:${f.name}`,
						provider,
						slug: f.name,
						name: `${FAMILIES[f.name.charAt(0)] ?? "Instance"} ${f.name}`,
						vcpu: f.vcpus,
						// OVH reports RAM in decimal MB (b2-7 → 7000).
						memoryGb: Math.round(f.ram / 100) / 10,
						diskGb: f.disk,
						// Public Cloud egress is unmetered in most regions.
						transferTb: 0,
						cpuType: SHARED.test(f.name) ? "shared" : "dedicated",
						arch: "x86",
						priceHourlyMicros: hourly,
						priceMonthlyMicros:
							priced === undefined && fallback
								? fallback.priceMonthlyMicros
								: hourly * HOURS_PER_MONTH,
						regions: [...regions],
					},
				];
			});
		},

		createServer: (input) =>
			capacityAware(provider, async () => {
				const region = input.regionSlug;
				// Flavor and image ids are per region, so resolve both by name.
				const [flavors, images] = await Promise.all([
					request<OFlavor[]>("GET", `${project}/flavor`, { query: { region } }),
					request<OImage[]>("GET", `${project}/image`, {
						query: { osType: "linux", region },
					}),
				]);
				const flavor = flavors.find(
					(f) =>
						f.name === input.planSlug &&
						f.region === region &&
						f.osType === "linux",
				);
				if (!flavor?.available) {
					throw new ProviderError(
						provider,
						`${input.planSlug} is not available in ${region}`,
						{ retryable: true },
					);
				}
				const imageName = providerImage("ovhcloud", input.image);
				const matches = images.filter(
					(i) => i.name === imageName && (i.status ?? "active") === "active",
				);
				// Prefer the generic build over flavor-specific variants of the same image.
				const image = matches.find((i) => !i.flavorType) ?? matches[0];
				if (!image) {
					throw new ProviderError(
						provider,
						`image "${imageName}" is not available in ${region}`,
						{
							retryable: true,
						},
					);
				}
				// No sshKeyId: cloud-init carries the keys, so the project's key store is left alone.
				const instance = await request<OInstance>(
					"POST",
					`${project}/instance`,
					{
						body: {
							name: hostname(input.name),
							flavorId: flavor.id,
							imageId: image.id,
							region,
							userData: input.userData,
							monthlyBilling: false,
						},
					},
				);
				return toServer(instance);
			}),

		getServer: (id) =>
			getOrGone(id, async () =>
				toServer(await request<OInstance>("GET", `${project}/instance/${id}`)),
			),

		deleteServer: (id) =>
			ignoreNotFound(request("DELETE", `${project}/instance/${id}`)),

		async powerAction(id, action) {
			if (action === "reboot") {
				await request("POST", `${project}/instance/${id}/reboot`, {
					body: { type: "soft" },
				});
			} else {
				await request("POST", `${project}/instance/${id}/${action}`);
			}
		},
	};
}

function toServer(i: OInstance): ProviderServer {
	const ip = (version: number) =>
		i.ipAddresses?.find((a) => a.version === version && a.type === "public")
			?.ip ?? null;
	return {
		providerServerId: i.id,
		status: STATUS[i.status] ?? "provisioning",
		ipv4: ip(4),
		ipv6: ip(6),
	};
}
