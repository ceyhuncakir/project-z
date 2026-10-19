import { cn } from "@switchyard/ui/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import { CodeBlock } from "../code-block";
import { hourly, Reveal, SectionIntro } from "./section";

export const llmModelsQuery = orpc.catalog.llmModels.queryOptions();

const PRECISIONS = [
	{ id: undefined, label: "native" },
	{ id: "fp16", label: "fp16" },
	{ id: "int8", label: "int8" },
	{ id: "int4", label: "int4" },
] as const;

type Precision = (typeof PRECISIONS)[number]["id"];

export function LlmSizer() {
	const models = useQuery(llmModelsQuery);
	const [model, setModel] = useState("llama-3.3-70b");
	const [precision, setPrecision] = useState<Precision>(undefined);
	const sizing = useQuery(
		orpc.catalog.sizeLlm.queryOptions({
			input: { model, precision },
			placeholderData: keepPreviousData,
		}),
	);
	const s = sizing.data;
	const best = s?.plans[0];
	const available = best?.gpu?.totalVramGb ?? 0;
	const fill = s && available ? Math.min(1, s.vramGb / available) : 0;

	return (
		<section id="gpu" className="scroll-mt-20 border-y bg-card/50">
			<div className="mx-auto max-w-6xl px-5 py-24">
				<SectionIntro
					index="05"
					label="GPU clouds"
					title="What does it take to serve…?"
					lede="Pick an open-weight model. Switchyard estimates the GPU memory it needs and finds the cheapest GPU plan that fits — the same answer your agent gets from size_llm."
				>
					<span className="self-start border border-warn/40 bg-warn/10 px-2.5 py-1 font-mono text-[11px] md:self-end">
						GPU clouds are in preview · simulated, indicative prices
					</span>
				</SectionIntro>

				<Reveal className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
					<div className="border bg-background">
						<div className="space-y-5 p-5">
							<div>
								<p className="label-mono">Model</p>
								<LayoutGroup id="sizer-model">
									<div className="mt-3 flex flex-wrap gap-1.5">
										{models.data?.map((m) => (
											<button
												key={m.id}
												type="button"
												aria-pressed={m.id === model}
												onClick={() => setModel(m.id)}
												className={cn(
													"relative border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors",
													m.id === model
														? "border-foreground text-background"
														: "text-muted-foreground hover:border-foreground/40 hover:text-foreground",
												)}
											>
												{m.id === model && (
													<motion.span
														layoutId="sizer-model-pill"
														className="absolute inset-0 bg-foreground"
													/>
												)}
												<span className="relative">{m.name}</span>
											</button>
										))}
									</div>
								</LayoutGroup>
							</div>
							<div>
								<p className="label-mono">Precision</p>
								<div className="mt-3 inline-flex border font-mono text-[11.5px]">
									{PRECISIONS.map((p) => (
										<button
											key={p.label}
											type="button"
											aria-pressed={p.id === precision}
											onClick={() => setPrecision(p.id)}
											className={cn(
												"border-l px-3 py-1.5 transition-colors first:border-l-0",
												p.id === precision
													? "bg-signal/10 text-signal"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											{p.label}
										</button>
									))}
								</div>
							</div>
						</div>
						<div className="border-t p-5">
							<div className="flex items-baseline justify-between">
								<span className="label-mono">GPU memory needed</span>
								<span className="tabular font-medium text-3xl tracking-tight">
									{s?.vramGb ?? "—"}
									<span className="text-base text-muted-foreground"> GB</span>
								</span>
							</div>
							<div className="mt-3 h-3 overflow-hidden bg-muted">
								<motion.div
									className="h-full origin-left bg-signal"
									initial={false}
									animate={{ scaleX: fill }}
									transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
								/>
							</div>
							<p className="mt-2 font-mono text-[11px] text-muted-foreground">
								{s
									? `${s.paramsB}B params · ${s.precision} · fills ${Math.round(fill * 100)}% of ${available} GB on the cheapest fit`
									: "…"}
							</p>
						</div>
					</div>

					<div className="flex min-w-0 flex-col gap-4">
						<div className="border bg-background">
							<p className="label-mono border-b px-4 py-3">
								Cheapest plans that fit
							</p>
							<ul className="divide-y">
								<AnimatePresence initial={false} mode="popLayout">
									{s?.plans.slice(0, 3).map((p, i) => (
										<motion.li
											layout
											key={p.id}
											initial={{ opacity: 0, x: 10 }}
											animate={{ opacity: 1, x: 0 }}
											exit={{ opacity: 0, x: -10 }}
											transition={{ duration: 0.3 }}
											className={cn(
												"flex items-center justify-between gap-3 px-4 py-3",
												i === 0 && "bg-signal/[0.05]",
											)}
										>
											<div className="min-w-0">
												<p className="truncate font-medium text-[13.5px]">
													{p.providerName} · {p.name}
												</p>
												<p className="truncate font-mono text-[11px] text-muted-foreground">
													{p.gpu
														? `${p.gpu.count}× ${p.gpu.model} · ${p.gpu.totalVramGb} GB VRAM`
														: ""}{" "}
													· {p.regions[0]?.city}
												</p>
											</div>
											<span
												className={cn(
													"tabular shrink-0 font-mono text-[13px]",
													i === 0 && "text-signal",
												)}
											>
												{hourly(p.priceHourlyMicros)}
											</span>
										</motion.li>
									))}
								</AnimatePresence>
								{s && !s.plans.length && (
									<li className="px-4 py-6 text-muted-foreground text-sm">
										Nothing in the catalog fits this one yet — try a lower
										precision.
									</li>
								)}
							</ul>
						</div>
						<CodeBlock
							compact
							tabs={[
								{
									label: "MCP",
									code: `create_server({\n  min_vram_gb: ${s?.vramGb ?? 0},\n  image: "ubuntu-22.04-cuda"\n})`,
								},
							]}
						/>
					</div>
				</Reveal>
			</div>
		</section>
	);
}
