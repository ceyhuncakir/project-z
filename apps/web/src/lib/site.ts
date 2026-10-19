/** Brand and copy constants. Rename the product here. */

export interface SiteProvider {
	id: string;
	name: string;
	/** Coming soon: can't be connected until its live adapter lands. */
	preview: boolean;
	/** One line for provider cards. */
	tagline: string;
}

const cloudProviders: SiteProvider[] = [
	{
		id: "hetzner",
		name: "Hetzner",
		preview: false,
		tagline:
			"Low-cost cloud servers from Germany, in Europe, the US and Singapore.",
	},
	{
		id: "digitalocean",
		name: "DigitalOcean",
		preview: false,
		tagline:
			"Developer-friendly Droplets in North America, Europe, Asia and Australia.",
	},
	{
		id: "vultr",
		name: "Vultr",
		preview: false,
		tagline: "Cloud compute in cities on every continent.",
	},
	{
		id: "linode",
		name: "Akamai Linode",
		preview: false,
		tagline: "Linode's developer cloud, now part of Akamai.",
	},
	{
		id: "ovhcloud",
		name: "OVHcloud",
		preview: false,
		tagline: "European public cloud from France, with predictable pricing.",
	},
	{
		id: "scaleway",
		name: "Scaleway",
		preview: false,
		tagline: "French cloud with zones in Paris, Amsterdam and Warsaw.",
	},
	{
		id: "upcloud",
		name: "UpCloud",
		preview: true,
		tagline: "Finnish cloud with locations in Europe, the US and Asia.",
	},
	{
		id: "contabo",
		name: "Contabo",
		preview: true,
		tagline: "Budget VPS from Germany with generous resources.",
	},
	{
		id: "civo",
		name: "Civo",
		preview: true,
		tagline: "UK cloud known for fast Kubernetes, with plain VMs too.",
	},
	{
		id: "exoscale",
		name: "Exoscale",
		preview: true,
		tagline: "Swiss cloud with data centres across Europe.",
	},
];

const gpuProviders: SiteProvider[] = [
	{
		id: "runpod",
		name: "RunPod",
		preview: true,
		tagline: "On-demand GPU pods for AI training and inference.",
	},
	{
		id: "lambda",
		name: "Lambda",
		preview: true,
		tagline: "GPU cloud built for deep learning.",
	},
	{
		id: "vastai",
		name: "Vast.ai",
		preview: true,
		tagline: "Marketplace of rented GPUs at low prices.",
	},
	{
		id: "coreweave",
		name: "CoreWeave",
		preview: true,
		tagline: "Specialised GPU cloud for large-scale AI.",
	},
	{
		id: "paperspace",
		name: "Paperspace",
		preview: true,
		tagline: "GPU machines for ML, now part of DigitalOcean.",
	},
	{
		id: "nebius",
		name: "Nebius",
		preview: true,
		tagline: "AI cloud with large NVIDIA GPU clusters.",
	},
	{
		id: "hyperstack",
		name: "Hyperstack",
		preview: true,
		tagline: "GPU cloud for AI workloads from NexGen Cloud.",
	},
];

export const site = {
	name: "HessianLabs",
	tagline: "One API for every cloud",
	description:
		"HessianLabs is the router for hosting: one API and one MCP endpoint in front of your own cloud accounts — Hetzner, DigitalOcean, Vultr, Akamai Linode, OVHcloud and Scaleway, with GPU clouds coming soon. Your agent gets the cheapest server that fits; your provider bills you directly.",
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
