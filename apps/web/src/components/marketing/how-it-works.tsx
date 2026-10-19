import { Reveal, SectionIntro } from "./section";

const STEPS = [
	{
		title: "Connect your clouds",
		body: "Paste an API token for Hetzner, DigitalOcean, Vultr or another provider. Servers run in your account, and your provider bills you directly.",
		code: "hetzner  connected  …a1b2",
	},
	{
		title: "Connect your agent",
		body: "One line in Claude Code, Cursor, Codex or any MCP client. Add a little credit for HessianLabs's fee, and give each agent its own key, budget and server limit.",
		code: "claude mcp add --transport http hessianlabs …",
	},
	{
		title: "Just ask",
		body: "“I need an 8 GB box near Frankfurt” or “three boxes in three countries.” The router picks across your accounts, provisions and hands back SSH.",
		code: "ssh root@203.0.113.42",
	},
];

export function HowItWorks() {
	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<SectionIntro
				index="02"
				label="How it works"
				title="Three steps from zero to root shell."
			/>
			<ol className="mt-12 grid grid-cols-1 gap-px border bg-border md:grid-cols-3">
				{STEPS.map((step, i) => (
					<Reveal
						as="li"
						key={step.title}
						delay={i * 0.08}
						className="flex min-w-0 flex-col gap-4 bg-background p-6"
					>
						<span className="font-mono text-[11px] text-muted-foreground">
							0{i + 1}
						</span>
						<h3 className="font-medium text-lg tracking-tight">{step.title}</h3>
						<p className="text-muted-foreground text-sm leading-relaxed">
							{step.body}
						</p>
						<code className="mt-auto truncate border bg-card px-3 py-2 font-mono text-[11.5px]">
							{step.code}
						</code>
					</Reveal>
				))}
			</ol>
		</section>
	);
}
