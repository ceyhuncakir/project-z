import { createCatalog } from "./catalog";
import { createDigitalOceanAdapter } from "./providers/digitalocean";
import { createHetznerAdapter } from "./providers/hetzner";
import { createLinodeAdapter } from "./providers/linode";
import { createOvhAdapter } from "./providers/ovhcloud";
import { createSandboxAdapter, type SandboxOptions } from "./providers/sandbox";
import { createScalewayAdapter } from "./providers/scaleway";
import { createVultrAdapter } from "./providers/vultr";
import {
	type LiveProviderId,
	PREVIEW_PROVIDER_IDS,
	type ProviderAdapter,
	type ProviderId,
	type ProviderInfo,
} from "./types";

export * from "./catalog";
export * from "./cloud-init";
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

/** Platform credentials. A provider without credentials runs in sandbox mode. */
export interface CloudConfig {
	/** Force every provider into sandbox mode, even when credentials exist. */
	sandboxOnly?: boolean;
	/** EUR→USD rate used to normalize prices from EUR-billed providers. */
	eurUsdRate?: number;
	sandbox?: SandboxOptions;
	hetzner?: { token: string };
	digitalocean?: { token: string };
	vultr?: { apiKey: string };
	linode?: { token: string };
	scaleway?: { secretKey: string; projectId: string };
	ovhcloud?: {
		endpoint: string;
		applicationKey: string;
		applicationSecret: string;
		consumerKey: string;
		projectId: string;
	};
}

export function createCloud(config: CloudConfig = {}) {
	const fx = config.eurUsdRate ?? 1.1;
	const live = !config.sandboxOnly;

	const live_: Record<LiveProviderId, ProviderAdapter> = {
		hetzner:
			live && config.hetzner
				? createHetznerAdapter(PROVIDERS.hetzner, {
						...config.hetzner,
						eurUsdRate: fx,
					})
				: createSandboxAdapter(PROVIDERS.hetzner, config.sandbox),
		digitalocean:
			live && config.digitalocean
				? createDigitalOceanAdapter(PROVIDERS.digitalocean, config.digitalocean)
				: createSandboxAdapter(PROVIDERS.digitalocean, config.sandbox),
		vultr:
			live && config.vultr
				? createVultrAdapter(PROVIDERS.vultr, config.vultr)
				: createSandboxAdapter(PROVIDERS.vultr, config.sandbox),
		linode:
			live && config.linode
				? createLinodeAdapter(PROVIDERS.linode, config.linode)
				: createSandboxAdapter(PROVIDERS.linode, config.sandbox),
		ovhcloud:
			live && config.ovhcloud
				? createOvhAdapter(PROVIDERS.ovhcloud, {
						...config.ovhcloud,
						eurUsdRate: fx,
					})
				: createSandboxAdapter(PROVIDERS.ovhcloud, config.sandbox),
		scaleway:
			live && config.scaleway
				? createScalewayAdapter(PROVIDERS.scaleway, {
						...config.scaleway,
						eurUsdRate: fx,
					})
				: createSandboxAdapter(PROVIDERS.scaleway, config.sandbox),
	};

	// Preview providers are always simulated until their live adapters land.
	const adapters = { ...live_ } as Record<ProviderId, ProviderAdapter>;
	for (const id of PREVIEW_PROVIDER_IDS) {
		adapters[id] = createSandboxAdapter(PROVIDERS[id], config.sandbox);
	}

	return {
		adapters,
		adapter: (id: ProviderId) => adapters[id],
		catalog: createCatalog(Object.values(adapters)),
	};
}

export type Cloud = ReturnType<typeof createCloud>;
