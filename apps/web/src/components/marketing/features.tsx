import { cn } from "@switchyard/ui/lib/utils";
import {
	BanknoteIcon,
	CpuIcon,
	GaugeIcon,
	KeyRoundIcon,
	ListChecksIcon,
	TerminalSquareIcon,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";

import { RoutingVisual } from "./routing-visual";
import { SectionIntro } from "./section";

function Tile({
	className,
	icon,
	title,
	body,
	children,
	index,
}: {
	className?: string;
	icon: ReactNode;
	title: string;
	body: string;
	children?: ReactNode;
	index: number;
}) {
	return (
		<motion.div
			className={cn(
				"group flex min-w-0 flex-col gap-3 bg-background p-6 transition-colors hover:bg-card",
				className,
			)}
			initial={{ opacity: 0, y: 14 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-60px" }}
			transition={{
				duration: 0.5,
				delay: (index % 3) * 0.07,
				ease: [0.22, 1, 0.36, 1],
			}}
		>
			<div className="flex items-center gap-2 text-muted-foreground transition-colors group-hover:text-signal [&_svg]:size-4">
				{icon}
			</div>
			<h3 className="font-medium text-[17px] tracking-tight">{title}</h3>
			<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
				{body}
			</p>
			{children && <div className="mt-auto pt-4">{children}</div>}
		</motion.div>
	);
}

export function Features() {
	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<SectionIntro
				index="04"
				label="Why route"
				title="Built for software that buys its own infrastructure."
			/>
			<div className="mt-12 grid grid-cols-1 gap-px border bg-border md:grid-cols-6">
				<Tile
					index={0}
					className="md:col-span-4"
					icon={<GaugeIcon />}
					title="Say what you need, not where."
					body="Describe the machine — cores, memory, GPU memory, continent, budget. The router ranks every matching plan across providers, provisions the cheapest, and falls back automatically when one is out of capacity."
				>
					<RoutingVisual />
				</Tile>
				<Tile
					index={1}
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
					index={2}
					className="md:col-span-2"
					icon={<CpuIcon />}
					title="CPUs and GPUs, one call"
					body="General clouds and GPU clouds share one catalog. Add min_vram_gb and the same create_server call lands on an H100 with CUDA ready."
				>
					<code className="block truncate border bg-card px-3 py-2 font-mono text-[11px]">
						create_server({"{"} min_vram_gb: 80 {"}"})
					</code>
				</Tile>
				<Tile
					index={3}
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
						<div className="h-1 overflow-hidden bg-muted">
							<motion.div
								className="h-full bg-signal"
								initial={{ width: "0%" }}
								whileInView={{ width: "32%" }}
								viewport={{ once: true }}
								transition={{
									duration: 1,
									delay: 0.3,
									ease: [0.22, 1, 0.36, 1],
								}}
							/>
						</div>
					</div>
				</Tile>
				<Tile
					index={4}
					className="md:col-span-2"
					icon={<TerminalSquareIcon />}
					title="SSH that just works"
					body="Your keys are installed via cloud-init on every provider. No key? A one-time pair is generated and handed to the agent."
				/>
				<Tile
					index={5}
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
					index={6}
					className="md:col-span-3"
					icon={<TerminalSquareIcon />}
					title="MCP for agents, REST for everything else"
					body="The same key works for the MCP endpoint and the OpenAPI-documented REST API, so scripts and agents share one account."
				>
					<code className="block truncate border bg-card px-3 py-2 font-mono text-[11px]">
						curl -X POST /v1/servers -H "Authorization: Bearer sy_live_…"
					</code>
				</Tile>
			</div>
		</section>
	);
}
