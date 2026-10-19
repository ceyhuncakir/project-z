import { PlusIcon } from "lucide-react";

const FAQ = [
	{
		q: "Do I need my own Hetzner, DigitalOcean or Vultr accounts?",
		a: "Yes. You connect your own accounts with an API token and servers run there, so your provider bills you directly at list price, under its own terms. HessianLabs adds routing, one API for all of them and agent guardrails, and charges a small fee per server from prepaid credits.",
	},
	{
		q: "Which providers can I connect?",
		a: "Hetzner, DigitalOcean, Vultr, Akamai Linode, OVHcloud and Scaleway. UpCloud, Contabo, Civo, Exoscale and the GPU clouds (RunPod, Lambda, Vast.ai, CoreWeave, Paperspace, Nebius, Hyperstack) are coming soon: they're in the catalog with indicative prices, but can't be connected until their adapters ship.",
	},
	{
		q: "How are my cloud credentials stored?",
		a: "Encrypted with AES-256-GCM before they reach the database, and never shown again. Use a token limited to servers — for Hetzner, a project just for HessianLabs — and revoke it at the provider whenever you like.",
	},
	{
		q: "Can I host an LLM?",
		a: "Soon. size_llm already estimates how much GPU memory a model needs. Once GPU clouds can be connected, create_server with min_vram_gb routes to the cheapest GPU plan that fits, booted with Ubuntu 22.04 and CUDA. Bring your serving stack — vLLM, TGI, llama.cpp.",
	},
	{
		q: "Which agents can use it?",
		a: "Anything that speaks MCP over Streamable HTTP with an auth header: Claude Code, Cursor, Codex, VS Code, Windsurf, Zed, Goose and more. Scripts and backends can use the REST API at /v1 with the same key.",
	},
	{
		q: "How do payments work?",
		a: "Your provider bills servers to your own account. HessianLabs's fee — a percentage of each server's list price, charged per minute — comes from credits you top up through Stripe Checkout. Top-ups carry a 5% fee (minimum $0.50), shown as its own line item. Tick “save card” to enable auto top-up, which charges the saved card when your balance drops below a threshold you choose. Receipts live in the Stripe billing portal.",
	},
	{
		q: "How do I stop an agent from overspending?",
		a: "Give each agent its own API key with a spend limit (measured at provider list prices) and a maximum number of concurrent servers. Every action lands in the activity log, and you can revoke a key — or the cloud token itself — at any time.",
	},
	{
		q: "What happens when my credits run out?",
		a: "New servers can't be created until you top up. Servers that are already running keep running: HessianLabs never powers off or deletes them over its fee. Auto top-up avoids the interruption entirely.",
	},
	{
		q: "What if I delete a server in my provider's console?",
		a: "HessianLabs notices within about five minutes and stops its fee. If you disconnect an account, or its token stops working, its servers are detached: they keep running in your account, unmanaged and with no fee.",
	},
	{
		q: "What if I get a refund?",
		a: "A refunded payment removes the matching share of credit from your balance automatically.",
	},
];

export function Faq() {
	return (
		<div className="divide-y border-y">
			{FAQ.map((item) => (
				<details key={item.q} className="group py-1">
					<summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[15px] [&::-webkit-details-marker]:hidden">
						{item.q}
						<PlusIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" />
					</summary>
					<p className="max-w-2xl pb-5 text-muted-foreground text-sm leading-relaxed">
						{item.a}
					</p>
				</details>
			))}
		</div>
	);
}
