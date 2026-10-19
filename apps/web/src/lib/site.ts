/** Brand and copy constants. Rename the product here. */

export interface SiteProvider {
	id: string;
	name: string;
	/** Simulated only until its live adapter lands. */
	preview: boolean;
}

const cloudProviders: SiteProvider[] = [
	{ id: "hetzner", name: "Hetzner", preview: false },
	{ id: "digitalocean", name: "DigitalOcean", preview: false },
	{ id: "vultr", name: "Vultr", preview: false },
	{ id: "linode", name: "Akamai Linode", preview: false },
	{ id: "ovhcloud", name: "OVHcloud", preview: false },
	{ id: "scaleway", name: "Scaleway", preview: false },
	{ id: "upcloud", name: "UpCloud", preview: true },
	{ id: "contabo", name: "Contabo", preview: true },
	{ id: "civo", name: "Civo", preview: true },
	{ id: "exoscale", name: "Exoscale", preview: true },
];

const gpuProviders: SiteProvider[] = [
	{ id: "runpod", name: "RunPod", preview: true },
	{ id: "lambda", name: "Lambda", preview: true },
	{ id: "vastai", name: "Vast.ai", preview: true },
	{ id: "coreweave", name: "CoreWeave", preview: true },
	{ id: "paperspace", name: "Paperspace", preview: true },
	{ id: "nebius", name: "Nebius", preview: true },
	{ id: "hyperstack", name: "Hyperstack", preview: true },
];

export const site = {
	name: "Switchyard",
	tagline: "One API for every cloud",
	description:
		"Switchyard is the router for hosting: one balance, one API and one MCP endpoint for 17 clouds — Hetzner, DigitalOcean, Vultr and more, plus GPU clouds like RunPod and Lambda for LLM hosting. Your agent gets the cheapest server that fits.",
	/** Every provider name, general clouds first. */
	providers: [...cloudProviders, ...gpuProviders].map((p) => p.name),
	cloudProviders,
	gpuProviders,
	/** MCP clients known to work with a bearer-token Streamable HTTP server. */
	clients: [
		"Claude Code",
		"Cursor",
		"Codex",
		"VS Code",
		"Windsurf",
		"Zed",
		"Goose",
		"Any MCP client",
		"REST API",
	],
};
