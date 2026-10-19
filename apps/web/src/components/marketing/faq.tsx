import { PlusIcon } from "lucide-react";

const FAQ = [
	{
		q: "Do I need my own Hetzner, DigitalOcean or OVH accounts?",
		a: "No. Servers run on Switchyard's provider accounts and are paid from your credit balance — like OpenRouter does for models. One signup, one invoice.",
	},
	{
		q: "Which agents can use it?",
		a: "Anything that speaks MCP over Streamable HTTP with an auth header: Claude Code, Cursor, Codex, VS Code, Windsurf, Goose and more. Scripts and backends can use the REST API at /v1 with the same key.",
	},
	{
		q: "How do I stop an agent from overspending?",
		a: "Every API key can carry a lifetime spend limit and a maximum number of concurrent servers. Credits are prepaid, so the worst case is bounded by your balance. Every action an agent takes lands in the activity log.",
	},
	{
		q: "What happens when my credits run out?",
		a: "Running servers are powered off immediately and marked suspended. Top up within 24 hours and start them again; otherwise they are destroyed so nothing keeps billing.",
	},
	{
		q: "How does my agent get into the server?",
		a: "Over SSH as root. We install your saved account keys (or keys the agent passes) through cloud-init. If there are none, a one-time key pair is generated and the private key is returned once, never stored.",
	},
	{
		q: "Are the prices really at cost?",
		a: "Hourly prices are synced from each provider's API and passed through unchanged (EUR prices converted to USD). We charge a 5% fee when you add credits. Usage is billed per minute with a one-hour minimum per server.",
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
