import { cn } from "@switchyard/ui/lib/utils";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useState } from "react";

import { CodeBlock } from "../code-block";
import { Reveal, SectionIntro } from "./section";

const CASES = [
	{
		id: "ci",
		label: "CI & test runners",
		prompt: "Run the integration suite on a fresh 4 vCPU box, then tear it down.",
		call: `create_server({\n  min_vcpu: 4,\n  min_memory_gb: 8,\n  continents: ["EU"],\n  user_data: "#!/bin/sh\\ncurl -fsSL get.docker.com | sh"\n})`,
		result: "contabo:cloud-vps-10 · Nuremberg · $0.0075/h",
		cost: "≈ $0.0075 per run",
		note: "One-hour minimum per server, however short the run.",
	},
	{
		id: "llm",
		label: "LLM inference",
		prompt: "Serve Llama 3.3 70B in int8 for an eval run.",
		call: `size_llm({ model: "llama-3.3-70b", precision: "int8" })\n// → 85 GB VRAM\ncreate_server({ min_vram_gb: 85 })`,
		result: "lambda:gpu_1x_gh200 · Virginia · $1.49/h",
		cost: "≈ $3 for a two-hour eval",
		note: "GPU clouds are in preview: simulated, with indicative prices.",
	},
	{
		id: "dev",
		label: "Ephemeral dev boxes",
		prompt: "Give me an Ubuntu box in Singapore to debug a latency issue.",
		call: `create_server({\n  countries: ["SG"],\n  min_memory_gb: 2,\n  image: "ubuntu-24.04"\n})`,
		result: "contabo:cloud-vps-10 · Singapore · $0.0075/h",
		cost: "≈ $0.18 per day",
		note: "Your saved SSH keys are installed automatically.",
	},
	{
		id: "data",
		label: "Data & scraping jobs",
		prompt: "Run the crawler from the US, Germany and Japan, then merge the results.",
		call: `// three calls, one per country\ncreate_server({ countries: ["US"] })\ncreate_server({ countries: ["DE"] })\ncreate_server({ countries: ["JP"] })`,
		result: "3 servers · 3 countries · one balance",
		cost: "≈ $0.02 per hour for all three",
		note: "Each server is billed per minute from the same balance.",
	},
	{
		id: "load",
		label: "Load testing",
		prompt: "Hit staging with 2k rps from Frankfurt for ten minutes.",
		call: `create_server({\n  regions: ["hetzner:fsn1"],\n  min_vcpu: 4\n})\n// … run k6, then\ndelete_server({ id })`,
		result: "hetzner:cx33 · Falkenstein · $0.0089/h",
		cost: "≈ $0.009 per test",
		note: "Delete when done; a spend-capped key keeps it bounded.",
	},
];

export function UseCases() {
	const [active, setActive] = useState(0);
	const item = CASES[active] ?? CASES[0];
	if (!item) return null;

	return (
		<section className="border-y bg-card/50">
			<div className="mx-auto max-w-6xl px-5 py-24">
				<SectionIntro index="03" label="Use cases" title="What agents do with a server room." />
				<Reveal className="mt-10">
					<LayoutGroup id="use-cases">
						<div role="tablist" className="flex gap-1 overflow-x-auto border-b">
							{CASES.map((c, i) => (
								<button
									key={c.id}
									type="button"
									role="tab"
									aria-selected={i === active}
									onClick={() => setActive(i)}
									className={cn(
										"relative shrink-0 px-3 py-2.5 text-[13px] transition-colors",
										i === active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
									)}
								>
									{c.label}
									{i === active && (
										<motion.span layoutId="use-case-underline" className="absolute inset-x-0 -bottom-px h-0.5 bg-signal" />
									)}
								</button>
							))}
						</div>
					</LayoutGroup>
					<AnimatePresence mode="wait" initial={false}>
						<motion.div
							key={item.id}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -6 }}
							transition={{ duration: 0.25 }}
							className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.15fr]"
						>
							<div className="space-y-6">
								<div>
									<p className="label-mono">The prompt</p>
									<p className="mt-3 text-balance font-medium text-2xl leading-snug tracking-tight">“{item.prompt}”</p>
								</div>
								<dl className="grid grid-cols-2 gap-px border bg-border text-sm">
									<div className="bg-background p-4">
										<dt className="label-mono">Routed to</dt>
										<dd className="mt-1.5 font-mono text-[12px]">{item.result}</dd>
									</div>
									<div className="bg-background p-4">
										<dt className="label-mono">Typical cost</dt>
										<dd className="mt-1.5 font-medium text-signal">{item.cost}</dd>
									</div>
								</dl>
								<p className="text-muted-foreground text-sm">{item.note}</p>
							</div>
							<CodeBlock tabs={[{ label: "MCP calls", code: item.call }]} />
						</motion.div>
					</AnimatePresence>
				</Reveal>
			</div>
		</section>
	);
}
