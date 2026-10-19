import { createCatalog } from "./catalog";
import { createDigitalOceanAdapter } from "./providers/digitalocean";
import { createHetznerAdapter } from "./providers/hetzner";
import { createLinodeAdapter } from "./providers/linode";
import { createOvhAdapter } from "./providers/ovhcloud";
import { createSandboxAdapter, type SandboxOptions } from "./providers/sandbox";
import { createScalewayAdapter } from "./providers/scaleway";
import { createVultrAdapter } from "./providers/vultr";
import type { ProviderAdapter, ProviderId, ProviderInfo } from "./types";

export * from "./catalog";
export * from "./cloud-init";
export * from "./images";
export * from "./money";
export * from "./ssh";
export * from "./types";

export const PROVIDERS: Record<ProviderId, Omit<ProviderInfo, "mode">> = {
	hetzner: {
		id: "hetzner",
		name: "Hetzner",
		website: "https://www.hetzner.com/cloud",
	},
	digitalocean: {
		id: "digitalocean",
		name: "DigitalOcean",
		website: "https://www.digitalocean.com",
	},
	vultr: { id: "vultr", name: "Vultr", website: "https://www.vultr.com" },
	linode: {
		id: "linode",
		name: "Akamai Linode",
		website: "https://www.linode.com",
	},
	ovhcloud: {
		id: "ovhcloud",
		name: "OVHcloud",
		website: "https://www.ovhcloud.com/en/public-cloud",
	},
	scaleway: {
		id: "scaleway",
		name: "Scaleway",
		website: "https://www.scaleway.com",
	},
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

	const adapters: Record<ProviderId, ProviderAdapter> = {
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

	return {
		adapters,
		adapter: (id: ProviderId) => adapters[id],
		catalog: createCatalog(Object.values(adapters)),
	};
}

export type Cloud = ReturnType<typeof createCloud>;
