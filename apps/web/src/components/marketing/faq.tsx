import { PlusIcon } from "lucide-react";

const FAQ = [
	{
		q: "Do I need my own Hetzner, DigitalOcean or RunPod accounts?",
		a: "No. Servers run on Switchyard's provider accounts and are paid from your credit balance — like OpenRouter does for models. One signup, one balance.",
	},
	{
		q: "Which providers are live today?",
		a: "Hetzner, DigitalOcean, Vultr, Akamai Linode, OVHcloud and Scaleway have live adapters. UpCloud, Contabo, Civo, Exoscale and the GPU clouds (RunPod, Lambda, Vast.ai, CoreWeave, Paperspace, Nebius, Hyperstack) are in preview: they use the same API but are simulated with indicative prices until their adapters ship.",
	},
	{
		q: "Can I host an LLM?",
		a: "Yes. Ask size_llm how much GPU memory a model needs (or pass min_vram_gb yourself) and create_server routes to the cheapest GPU plan that fits, booted with Ubuntu 22.04 and CUDA. Bring your serving stack — vLLM, TGI, llama.cpp.",
	},
	{
		q: "Which agents can use it?",
		a: "Anything that speaks MCP over Streamable HTTP with an auth header: Claude Code, Cursor, Codex, VS Code, Windsurf, Zed, Goose and more. Scripts and backends can use the REST API at /v1 with the same key.",
	},
	{
		q: "How do payments work?",
		a: "You top up through Stripe Checkout. The 5% fee is shown as its own line item. Tick “save card” to enable auto top-up, which charges the saved card when your balance drops below a threshold you choose. Receipts live in the Stripe billing portal.",
	},
	{
		q: "How do I stop an agent from overspending?",
		a: "Give each agent its own API key with a spend limit and a maximum number of concurrent servers. Credits are prepaid, so the worst case is bounded by your balance — and every action lands in the activity log.",
	},
	{
		q: "What happens when my credits run out?",
		a: "Running servers are powered off and marked suspended. Top up within 24 hours and start them again; otherwise they're destroyed so nothing keeps billing. Auto top-up avoids this entirely.",
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
