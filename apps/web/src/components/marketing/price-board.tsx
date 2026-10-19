import { buttonVariants } from "@switchyard/ui/components/button";
import { cn } from "@switchyard/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useState } from "react";

import { flag, formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { hourlyPrice, Reveal, SectionIntro } from "./section";

export const BOARDS = [
	{
		id: "cpu",
		label: "CPU · 2 vCPU / 4 GB",
		query: orpc.catalog.plans.queryOptions({
			input: {
				filters: { kind: "cpu", minVcpu: 2, minMemoryGb: 4 },
				sort: "price",
				limit: 500,
			},
		}),
	},
	{
		id: "gpu",
		label: "GPU · ≥ 80 GB VRAM",
		query: orpc.catalog.plans.queryOptions({
			input: {
				filters: { kind: "gpu", minVramGb: 80 },
				sort: "price",
				limit: 500,
			},
		}),
	},
] as const;

export function PriceBoard() {
	const [active, setActive] = useState(0);
	const board = BOARDS[active] ?? BOARDS[0];
	const { data } = useQuery(board.query);
	const cheapest = new Map<string, NonNullable<typeof data>["plans"][number]>();
	for (const p of data?.plans ?? [])
		if (!cheapest.has(p.provider)) cheapest.set(p.provider, p);
	const rows = [...cheapest.values()];

	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<SectionIntro
				index="06"
				label="Live prices"
				title={`Same machine, ${rows.length || "many"} prices.`}
				lede="The cheapest matching plan at each provider, straight from the catalog your agent searches."
			>
				<Link to="/catalog" className={buttonVariants({ variant: "outline" })}>
					All plans <ArrowRightIcon />
				</Link>
			</SectionIntro>

			<Reveal className="mt-10 border">
				<LayoutGroup id="board-tabs">
					<div role="tablist" className="flex border-b bg-card">
						{BOARDS.map((b, i) => (
							<button
								key={b.id}
								type="button"
								role="tab"
								aria-selected={i === active}
								onClick={() => setActive(i)}
								className={cn(
									"relative px-4 py-3 font-mono text-[12px] transition-colors",
									i === active
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{b.label}
								{i === active && (
									<motion.span
										layoutId="board-underline"
										className="absolute inset-x-0 -bottom-px h-0.5 bg-signal"
									/>
								)}
							</button>
						))}
					</div>
				</LayoutGroup>
				<div className="overflow-x-auto">
					<div className="min-w-[640px]">
						<div className="grid grid-cols-[1.3fr_1.3fr_1.6fr_1fr_0.9fr_0.9fr] border-b px-4 py-3">
							{[
								"Provider",
								"Plan",
								"Specs",
								"Regions",
								"Per hour",
								"Per month",
							].map((h) => (
								<span key={h} className="label-mono">
									{h}
								</span>
							))}
						</div>
						<ul className="divide-y text-sm">
							{!rows.length &&
								Array.from({ length: 6 }, (_, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
									<li key={i} className="px-4 py-3.5">
										<div className="h-4 animate-pulse bg-muted" />
									</li>
								))}
							<AnimatePresence initial={false} mode="popLayout">
								{rows.map((p, i) => (
									<motion.li
										layout
										key={`${board.id}:${p.provider}`}
										initial={{ opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0 }}
										transition={{ duration: 0.3, delay: i * 0.03 }}
										className={cn(
											"grid grid-cols-[1.3fr_1.3fr_1.6fr_1fr_0.9fr_0.9fr] items-center px-4 py-3",
											i === 0 && "bg-signal/[0.05]",
										)}
									>
										<span className="font-medium">
											{p.providerName}
											{i === 0 && (
												<span className="ml-2 font-mono text-[10px] text-signal uppercase">
													cheapest
												</span>
											)}
										</span>
										<span className="truncate font-mono text-[12px]">
											{p.name}
										</span>
										<span className="truncate text-muted-foreground">
											{p.gpu
												? `${p.gpu.count}× ${p.gpu.model} · ${p.gpu.totalVramGb} GB`
												: `${p.vcpu} vCPU · ${p.memoryGb} GB · ${p.diskGb} GB`}
										</span>
										<span className="text-muted-foreground">
											{[...new Set(p.regions.map((r) => r.country))]
												.slice(0, 4)
												.map(flag)
												.join(" ")}
											{p.regions.length > 4 && ` +${p.regions.length - 4}`}
										</span>
										<span className="tabular font-mono">
											{hourlyPrice(p.priceHourlyMicros)}
										</span>
										<span className="tabular font-mono text-muted-foreground">
											{formatUsd(p.priceMonthlyMicros)}
										</span>
									</motion.li>
								))}
							</AnimatePresence>
						</ul>
					</div>
				</div>
			</Reveal>
		</section>
	);
}
