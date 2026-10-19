import { buttonVariants } from "@switchyard/ui/components/button";
import { cn } from "@switchyard/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRightIcon,
	BanknoteIcon,
	GaugeIcon,
	KeyRoundIcon,
	ListChecksIcon,
	PowerIcon,
	TerminalSquareIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { AgentTerminal } from "@/components/marketing/agent-terminal";
import { Faq } from "@/components/marketing/faq";
import { RoutingVisual } from "@/components/marketing/routing-visual";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { McpSnippets } from "@/components/mcp-snippets";
import { MCP_URL } from "@/lib/api-url";
import { flag, formatUsd } from "@/lib/format";
import { site } from "@/lib/site";
import { orpc } from "@/utils/orpc";

const boardQuery = orpc.catalog.plans.queryOptions({
	input: { filters: { minVcpu: 2, minMemoryGb: 4 }, sort: "price", limit: 500 },
});

export const Route = createFileRoute("/")({
	loader: ({ context }) => context.queryClient.prefetchQuery(boardQuery),
	component: Landing,
});

function Landing() {
	return (
		<div className="flex min-h-svh flex-col">
			<SiteHeader />
			<main className="flex-1">
				<Hero />
				<ProviderStrip />
				<HowItWorks />
				<Features />
				<PriceBoard />
				<Connect />
				<Pricing />
				<section className="mx-auto max-w-3xl px-5 py-24">
					<SectionLabel index="06" label="Questions" />
					<h2 className="mt-4 mb-10 font-medium text-3xl tracking-tight">
						Good to know
					</h2>
					<Faq />
				</section>
				<FinalCta />
			</main>
			<SiteFooter />
		</div>
	);
}

function SectionLabel({ index, label }: { index: string; label: string }) {
	return (
		<p className="label-mono">
			<span className="text-signal">{index}</span> / {label}
		</p>
	);
}

function Hero() {
	return (
		<section className="relative overflow-hidden border-b">
			<div className="pointer-events-none absolute inset-0 bg-grid" />
			<div className="relative mx-auto max-w-4xl px-5 pt-20 pb-16 text-center sm:pt-28">
				<p className="label-mono inline-flex items-center gap-2 border bg-background px-2.5 py-1">
					<span className="size-1.5 rounded-full bg-signal" />
					The router for hosting
				</p>
				<h1 className="mx-auto mt-6 max-w-3xl text-balance font-medium text-[2.6rem] leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl">
					Give your agent a server room.
				</h1>
				<p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground leading-relaxed sm:text-lg">
					One MCP endpoint and one prepaid balance for{" "}
					{site.providers.slice(0, -1).join(", ")} and {site.providers.at(-1)}.
					Your agent says what it needs — {site.name} finds the cheapest server
					that fits, bills it by the minute, and tears it down when the job is
					done.
				</p>
				<div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
					<Link
						to="/signup"
						className={buttonVariants({ variant: "signal", size: "xl" })}
					>
						Get started <ArrowRightIcon />
					</Link>
					<Link
						to="/catalog"
						className={buttonVariants({ variant: "outline", size: "xl" })}
					>
						Browse the catalog
					</Link>
				</div>
				<p className="mt-5 font-mono text-[11px] text-muted-foreground">
					No provider accounts · pay only for what runs · cancel by deleting
				</p>
			</div>
			<div className="relative mx-auto max-w-3xl px-5 pb-20">
				<AgentTerminal />
			</div>
		</section>
	);
}

function ProviderStrip() {
	return (
		<section className="border-b">
			<div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-8 md:flex-row md:justify-between">
				<span className="label-mono shrink-0">Routes to</span>
				<ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-medium text-[15px] text-foreground/70 tracking-tight">
					{site.providers.map((p) => (
						<li key={p}>{p}</li>
					))}
				</ul>
			</div>
		</section>
	);
}

const STEPS = [
	{
		title: "Add credits",
		body: "Top up once by card. Provider prices pass straight through; a small fee applies to top-ups.",
		code: "balance  $50.00",
	},
	{
		title: "Connect your agent",
		body: "One line in Claude Code, Cursor, Codex or any MCP client. Give each agent its own key and budget.",
		code: "claude mcp add --transport http switchyard …",
	},
	{
		title: "Just ask",
		body: "“I need an 8 GB box near Frankfurt for an hour.” The router picks, provisions and hands back SSH.",
		code: "ssh root@203.0.113.42",
	},
];

function HowItWorks() {
	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<SectionLabel index="01" label="How it works" />
			<h2 className="mt-4 max-w-xl font-medium text-3xl tracking-tight">
				Three steps from zero to root shell.
			</h2>
			<ol className="mt-12 grid gap-px border bg-border md:grid-cols-3">
				{STEPS.map((step, i) => (
					<li
						key={step.title}
						className="flex flex-col gap-4 bg-background p-6"
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
					</li>
				))}
			</ol>
		</section>
	);
}

function Tile({
	className,
	icon,
	title,
	body,
	children,
}: {
	className?: string;
	icon: ReactNode;
	title: string;
	body: string;
	children?: ReactNode;
}) {
	return (
		<div className={cn("flex flex-col gap-3 bg-background p-6", className)}>
			<div className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
				{icon}
			</div>
			<h3 className="font-medium text-[17px] tracking-tight">{title}</h3>
			<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
				{body}
			</p>
			{children && <div className="mt-auto pt-4">{children}</div>}
		</div>
	);
}

function Features() {
	return (
		<section className="border-y bg-card/50">
			<div className="mx-auto max-w-6xl px-5 py-24">
				<SectionLabel index="02" label="Why route" />
				<h2 className="mt-4 max-w-xl font-medium text-3xl tracking-tight">
					Built for software that buys its own infrastructure.
				</h2>
				<div className="mt-12 grid gap-px border bg-border md:grid-cols-6">
					<Tile
						className="md:col-span-4"
						icon={<GaugeIcon />}
						title="Say what you need, not where."
						body="Describe the box — cores, memory, continent, budget. The router ranks every matching plan across providers, provisions the cheapest, and falls back automatically when one is out of capacity."
					>
						<RoutingVisual />
					</Tile>
					<Tile
						className="md:col-span-2"
						icon={<BanknoteIcon />}
						title="Per-minute billing"
						body="One balance across every provider, charged by the minute. Destroy a server and billing stops."
					>
						<p className="tabular font-medium text-4xl tracking-tight">
							$0.0055<span className="text-base text-muted-foreground">/h</span>
						</p>
						<p className="mt-1 font-mono text-[11px] text-muted-foreground">
							2 vCPU · 4 GB · Falkenstein
						</p>
					</Tile>
					<Tile
						className="md:col-span-2"
						icon={<KeyRoundIcon />}
						title="Budgets per agent"
						body="Each API key gets its own spend cap and server limit. Hand out keys without handing over your card."
					>
						<div className="space-y-1.5 font-mono text-[11px]">
							<div className="flex justify-between">
								<span>ci-agent</span>
								<span className="text-muted-foreground">$3.20 / $10.00</span>
							</div>
							<div className="h-1 bg-muted">
								<div className="h-full w-[32%] bg-signal" />
							</div>
						</div>
					</Tile>
					<Tile
						className="md:col-span-2"
						icon={<TerminalSquareIcon />}
						title="SSH that just works"
						body="Your keys are installed via cloud-init on every provider. No key? A one-time pair is generated and handed to the agent."
					/>
					<Tile
						className="md:col-span-2"
						icon={<PowerIcon />}
						title="No surprise invoices"
						body="Prepaid by design. At zero balance servers power off; after 24 hours they're destroyed. Nothing bills in the dark."
					/>
					<Tile
						className="md:col-span-3"
						icon={<ListChecksIcon />}
						title="Every action on the record"
						body="Which key created what, where, and what it cost — one activity log across all providers."
					>
						<ul className="divide-y border bg-card font-mono text-[11px]">
							{[
								[
									"mcp",
									"Created fsn1-x0d3a7 (CX23, Falkenstein) on Hetzner",
									"2m",
								],
								["mcp", "Deleted fsn1-x0d3a7", "1m"],
							].map(([actor, msg, t]) => (
								<li key={msg} className="flex gap-3 px-3 py-2">
									<span className="text-signal">{actor}</span>
									<span className="truncate">{msg}</span>
									<span className="ml-auto text-muted-foreground">{t}</span>
								</li>
							))}
						</ul>
					</Tile>
					<Tile
						className="md:col-span-3"
						icon={<TerminalSquareIcon />}
						title="MCP for agents, REST for everything else"
						body="The same key works for the MCP endpoint and the OpenAPI-documented REST API, so your scripts and your agents share one account."
					>
						<code className="block truncate border bg-card px-3 py-2 font-mono text-[11px]">
							curl -X POST /v1/servers -H "Authorization: Bearer sy_live_…"
						</code>
					</Tile>
				</div>
			</div>
		</section>
	);
}

function PriceBoard() {
	const { data } = useQuery(boardQuery);
	const cheapest = new Map<string, NonNullable<typeof data>["plans"][number]>();
	for (const p of data?.plans ?? [])
		if (!cheapest.has(p.provider)) cheapest.set(p.provider, p);
	const rows = [...cheapest.values()];

	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
				<div>
					<SectionLabel index="03" label="Live prices" />
					<h2 className="mt-4 max-w-xl font-medium text-3xl tracking-tight">
						Same box, six prices.
					</h2>
					<p className="mt-3 max-w-lg text-muted-foreground text-sm">
						The cheapest plan with at least 2 vCPU and 4 GB RAM at each
						provider, straight from the catalog your agent searches.
					</p>
				</div>
				<Link to="/catalog" className={buttonVariants({ variant: "outline" })}>
					All plans <ArrowRightIcon />
				</Link>
			</div>
			<div className="mt-10 overflow-x-auto border">
				<table className="w-full min-w-[640px] text-sm">
					<thead>
						<tr className="border-b bg-card text-left">
							{[
								"Provider",
								"Plan",
								"Specs",
								"Regions",
								"Per hour",
								"Per month",
							].map((h) => (
								<th key={h} className="label-mono px-4 py-3 font-normal">
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y">
						{rows.length === 0 &&
							Array.from({ length: 6 }, (_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
								<tr key={i}>
									<td colSpan={6} className="px-4 py-3.5">
										<div className="h-4 w-full animate-pulse bg-muted" />
									</td>
								</tr>
							))}
						{rows.map((p, i) => (
							<tr key={p.id} className={cn(i === 0 && "bg-signal/[0.05]")}>
								<td className="px-4 py-3 font-medium">
									{p.providerName}
									{i === 0 && (
										<span className="ml-2 font-mono text-[10px] text-signal uppercase">
											cheapest
										</span>
									)}
								</td>
								<td className="px-4 py-3 font-mono text-[12px]">{p.name}</td>
								<td className="px-4 py-3 text-muted-foreground">
									{p.vcpu} vCPU · {p.memoryGb} GB · {p.diskGb} GB
								</td>
								<td className="px-4 py-3 text-muted-foreground">
									{p.regions
										.slice(0, 4)
										.map((r) => flag(r.country))
										.join(" ")}
									{p.regions.length > 4 && ` +${p.regions.length - 4}`}
								</td>
								<td className="tabular px-4 py-3 font-mono">
									{formatUsd(p.priceHourlyMicros, { precise: true })}
								</td>
								<td className="tabular px-4 py-3 font-mono text-muted-foreground">
									{formatUsd(p.priceMonthlyMicros)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function Connect() {
	return (
		<section className="border-y bg-card/50">
			<div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 lg:grid-cols-[1fr_1.3fr] lg:items-center">
				<div>
					<SectionLabel index="04" label="Connect" />
					<h2 className="mt-4 font-medium text-3xl tracking-tight">
						One line, any agent.
					</h2>
					<p className="mt-4 max-w-md text-muted-foreground text-sm leading-relaxed">
						{site.name} speaks the Model Context Protocol over Streamable HTTP.
						Create a key, paste the config, and your agent gets ten tools:
						search plans, create, inspect, power and delete servers, and check
						its balance.
					</p>
					<ul className="mt-6 space-y-2 font-mono text-[12px]">
						{[
							"search_plans",
							"create_server",
							"get_server",
							"delete_server",
							"get_balance",
						].map((t) => (
							<li key={t} className="flex items-center gap-2">
								<span className="text-signal">●</span> {t}
							</li>
						))}
						<li className="text-muted-foreground">
							+ list_servers, server_action, list_regions …
						</li>
					</ul>
				</div>
				<McpSnippets mcpUrl={MCP_URL} />
			</div>
		</section>
	);
}

function Pricing() {
	return (
		<section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
			<SectionLabel index="05" label="Pricing" />
			<div className="mt-4 grid gap-12 lg:grid-cols-2">
				<div>
					<h2 className="font-medium text-3xl tracking-tight">
						Provider prices. Zero markup.
					</h2>
					<p className="mt-4 max-w-md text-muted-foreground text-sm leading-relaxed">
						You pay exactly the hourly price each provider lists. We charge 5%
						(minimum $0.50) when you add credits — the same model OpenRouter
						uses for models.
					</p>
					<ul className="mt-8 space-y-3 text-sm">
						{[
							"Billed per minute, one-hour minimum per server",
							"One balance across every provider and region",
							"Spend limits and server caps per API key",
							"Stopped servers still bill — delete to stop",
							"Unused credit stays on your balance",
						].map((item) => (
							<li key={item} className="flex gap-3">
								<span className="mt-2 size-1.5 shrink-0 bg-signal" />
								{item}
							</li>
						))}
					</ul>
				</div>
				<div className="border bg-card">
					<div className="border-b px-6 py-4">
						<p className="label-mono">Example top-up</p>
					</div>
					<dl className="divide-y font-mono text-sm">
						{[
							["Credits added", "$50.00"],
							["Top-up fee (5%)", "$2.50"],
							["Charged to card", "$52.50"],
						].map(([k, v]) => (
							<div key={k} className="flex justify-between px-6 py-4">
								<dt className="text-muted-foreground">{k}</dt>
								<dd className="tabular">{v}</dd>
							</div>
						))}
						<div className="flex justify-between bg-background px-6 py-4">
							<dt className="text-muted-foreground">
								Runs a 2 vCPU / 4 GB box for
							</dt>
							<dd className="tabular text-signal">~9,100 hours</dd>
						</div>
					</dl>
				</div>
			</div>
		</section>
	);
}

function FinalCta() {
	return (
		<section className="border-t bg-foreground text-background">
			<div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 py-20 md:flex-row md:items-center">
				<div>
					<p className="font-mono text-[11px] text-background/60 uppercase tracking-[0.08em]">
						<span className="text-signal">07</span> / Start
					</p>
					<h2 className="mt-3 max-w-xl font-medium text-3xl tracking-tight sm:text-4xl">
						Your agent's first server is thirty seconds away.
					</h2>
				</div>
				<Link
					to="/signup"
					className={buttonVariants({ variant: "signal", size: "xl" })}
				>
					Create an account <ArrowRightIcon />
				</Link>
			</div>
		</section>
	);
}
