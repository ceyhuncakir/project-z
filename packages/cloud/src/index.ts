import { createCatalog } from "./catalog";
import {
	type ProviderCredentials,
	providerCredentialsSchemas,
} from "./credentials";
import { createDigitalOceanAdapter } from "./providers/digitalocean";
import { createHetznerAdapter } from "./providers/hetzner";
import { createLinodeAdapter } from "./providers/linode";
import { createOvhAdapter } from "./providers/ovhcloud";
import { createSandboxAdapter, type SandboxOptions } from "./providers/sandbox";
import { createScalewayAdapter } from "./providers/scaleway";
import { createVultrAdapter } from "./providers/vultr";
import {
	type AdapterMode,
	LIVE_PROVIDER_IDS,
	type LiveProviderId,
	PREVIEW_PROVIDER_IDS,
	PROVIDER_IDS,
	type ProviderAdapter,
	ProviderError,
	type ProviderId,
	type ProviderInfo,
} from "./types";

export * from "./catalog";
export * from "./cloud-init";
export * from "./credentials";
export * from "./images";
export * from "./llm";
export * from "./money";
export * from "./ssh";
export * from "./types";

type ProviderMeta = Omit<ProviderInfo, "mode">;

const provider = (
	id: ProviderId,
	name: string,
	website: string,
	category: ProviderMeta["category"] = "cloud",
): ProviderMeta => ({
	id,
	name,
	website,
	category,
	preview: (PREVIEW_PROVIDER_IDS as readonly string[]).includes(id),
});

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
	hetzner: provider("hetzner", "Hetzner", "https://www.hetzner.com/cloud"),
	digitalocean: provider(
		"digitalocean",
		"DigitalOcean",
		"https://www.digitalocean.com",
	),
	vultr: provider("vultr", "Vultr", "https://www.vultr.com"),
	linode: provider("linode", "Akamai Linode", "https://www.linode.com"),
	ovhcloud: provider(
		"ovhcloud",
		"OVHcloud",
		"https://www.ovhcloud.com/en/public-cloud",
	),
	scaleway: provider("scaleway", "Scaleway", "https://www.scaleway.com"),
	upcloud: provider("upcloud", "UpCloud", "https://upcloud.com"),
	contabo: provider("contabo", "Contabo", "https://contabo.com"),
	civo: provider("civo", "Civo", "https://www.civo.com"),
	exoscale: provider("exoscale", "Exoscale", "https://www.exoscale.com"),
	runpod: provider("runpod", "RunPod", "https://www.runpod.io", "gpu"),
	lambda: provider("lambda", "Lambda", "https://lambda.ai", "gpu"),
	vastai: provider("vastai", "Vast.ai", "https://vast.ai", "gpu"),
	coreweave: provider(
		"coreweave",
		"CoreWeave",
		"https://www.coreweave.com",
		"gpu",
	),
	paperspace: provider(
		"paperspace",
		"Paperspace",
		"https://www.paperspace.com",
		"gpu",
	),
	nebius: provider("nebius", "Nebius", "https://nebius.com", "gpu"),
	hyperstack: provider(
		"hyperstack",
		"Hyperstack",
		"https://www.hyperstack.cloud",
		"gpu",
	),
};

/**
 * Platform credentials, used only to read providers' price lists. Servers are
 * created in each user's own account through `connect`. A provider without a
 * platform token serves its reference catalog.
 */
export interface CloudConfig {
	/** Simulate every provider: reference catalogs, and `connect` accepts any credentials. */
	sandboxOnly?: boolean;
	/** EUR→USD rate used to normalize prices from EUR-billed providers. */
	eurUsdRate?: number;
	sandbox?: SandboxOptions;
	hetzner?: ProviderCredentials["hetzner"];
	digitalocean?: ProviderCredentials["digitalocean"];
	vultr?: ProviderCredentials["vultr"];
	linode?: ProviderCredentials["linode"];
	scaleway?: ProviderCredentials["scaleway"];
	ovhcloud?: ProviderCredentials["ovhcloud"];
}

export type ProviderConnection = {
	[P in LiveProviderId]: { provider: P; credentials: ProviderCredentials[P] };
}[LiveProviderId];

export const isLiveProvider = (id: string): id is LiveProviderId =>
	(LIVE_PROVIDER_IDS as readonly string[]).includes(id);

export function createLiveAdapter(
	conn: ProviderConnection,
	eurUsdRate: number,
): ProviderAdapter {
	switch (conn.provider) {
		case "hetzner":
			return createHetznerAdapter(PROVIDERS.hetzner, {
				...conn.credentials,
				eurUsdRate,
			});
		case "digitalocean":
			return createDigitalOceanAdapter(
				PROVIDERS.digitalocean,
				conn.credentials,
			);
		case "vultr":
			return createVultrAdapter(PROVIDERS.vultr, conn.credentials);
		case "linode":
			return createLinodeAdapter(PROVIDERS.linode, conn.credentials);
		case "scaleway":
			return createScalewayAdapter(PROVIDERS.scaleway, {
				...conn.credentials,
				eurUsdRate,
			});
		case "ovhcloud":
			return createOvhAdapter(PROVIDERS.ovhcloud, {
				...conn.credentials,
				eurUsdRate,
			});
	}
}

export function createCloud(config: CloudConfig = {}) {
	const eurUsdRate = config.eurUsdRate ?? 1.1;
	const sandboxOnly = Boolean(config.sandboxOnly);

	// One simulated account per provider, shared so server state survives between requests.
	const sandboxes = Object.fromEntries(
		PROVIDER_IDS.map((id) => [
			id,
			createSandboxAdapter(PROVIDERS[id], config.sandbox),
		]),
	) as Record<ProviderId, ProviderAdapter>;

	const priceLists = LIVE_PROVIDER_IDS.flatMap((provider) => {
		const credentials = config[provider];
		if (sandboxOnly || !credentials) return [];
		return [
			createLiveAdapter(
				{ provider, credentials } as ProviderConnection,
				eurUsdRate,
			),
		];
	});
	const catalogAdapters = PROVIDER_IDS.map(
		(id) => priceLists.find((a) => a.info.id === id) ?? sandboxes[id],
	);

	/** Every provider with a live adapter, or all of them when simulating. */
	const connectable = (id: ProviderId) => sandboxOnly || isLiveProvider(id);

	return {
		mode: (sandboxOnly ? "sandbox" : "live") as AdapterMode,
		catalog: createCatalog(catalogAdapters),
		connectable,
		/** An adapter acting in a user's own account. */
		connect(provider: ProviderId, credentials: unknown): ProviderAdapter {
			if (sandboxOnly) return sandboxes[provider];
			if (!isLiveProvider(provider)) {
				throw new ProviderError(provider, "not available yet", {
					status: 400,
				});
			}
			return createLiveAdapter(
				{
					provider,
					credentials: providerCredentialsSchemas[provider].parse(credentials),
				} as ProviderConnection,
				eurUsdRate,
			);
		},
	};
}

export type Cloud = ReturnType<typeof createCloud>;
