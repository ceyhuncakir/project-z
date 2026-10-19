import { cn } from "@switchyard/ui/lib/utils";
import { LayoutGroup, motion } from "motion/react";

import { phase } from "./clock";
import { Appear, OutLine, PanelTitle, ToolLine } from "./parts";

export const LLM_DURATION = 9_800;
export const LLM_STATIC_T = 7_800;

const MODELS = ["Llama 3.1 8B", "Llama 3.3 70B", "Qwen2.5 72B", "DeepSeek-R1"];
const PRECISIONS = ["fp16", "int8", "int4"];
const NEED_GB = 85;
const SCALE_GB = 160;

const PLANS = [
	{ id: "runpod", label: "RunPod · 2× A100 80GB", vram: 160, price: 3.28 },
	{ id: "nebius", label: "Nebius · 1× H200", vram: 141, price: 3.5 },
	{ id: "lambda", label: "Lambda · 1× GH200", vram: 96, price: 1.49 },
	{ id: "vastai", label: "Vast.ai · 4× RTX 4090", vram: 96, price: 1.55 },
];
const RANKED = [...PLANS].sort((a, b) => a.price - b.price);

export function SceneLlm({ t }: { t: number }) {
	const model = t >= 500 ? 1 : 0;
	const precision = t >= 1_100 ? 1 : 0;
	const fill = (NEED_GB / SCALE_GB) * phase(t, 1_400, 1_000);
	const ranked = t >= 3_300;
	const plans = ranked ? RANKED : PLANS;

	return (
		<div className="grid h-full grid-cols-1 gap-px bg-border md:grid-cols-[1fr_1.1fr]">
			<div className="flex min-w-0 flex-col bg-card">
				<PanelTitle
					right={
						<span className="font-mono text-[10.5px] text-muted-foreground">
							size_llm
						</span>
					}
				>
					Model
				</PanelTitle>
				<div className="space-y-4 px-4 py-4">
					<LayoutGroup id="llm-model">
						<div className="flex flex-wrap gap-1.5">
							{MODELS.map((m, i) => (
								<span
									key={m}
									className={cn(
										"relative px-2 py-1 font-mono text-[11px]",
										i === model ? "text-background" : "text-muted-foreground",
									)}
								>
									{i === model && (
										<motion.span
											layoutId="model-pill"
											className="absolute inset-0 bg-foreground"
										/>
									)}
									<span className="relative">{m}</span>
								</span>
							))}
						</div>
					</LayoutGroup>
					<LayoutGroup id="llm-precision">
						<div className="inline-flex border font-mono text-[11px]">
							{PRECISIONS.map((p, i) => (
								<span
									key={p}
									className={cn(
										"relative px-2.5 py-1",
										i === precision ? "text-signal" : "text-muted-foreground",
									)}
								>
									{i === precision && (
										<motion.span
											layoutId="precision-pill"
											className="absolute inset-0 bg-signal/10"
										/>
									)}
									<span className="relative">{p}</span>
								</span>
							))}
						</div>
					</LayoutGroup>
					<div>
						<div className="flex items-baseline justify-between font-mono text-[11px]">
							<span className="text-muted-foreground">GPU memory needed</span>
							<span className="tabular text-[15px] text-foreground">
								{Math.round(NEED_GB * phase(t, 1_400, 1_000))} GB
							</span>
						</div>
						<div className="relative mt-2 h-2.5 bg-muted">
							<motion.div
								className="absolute inset-y-0 left-0 origin-left bg-signal"
								style={{ width: "100%" }}
								initial={false}
								animate={{ scaleX: fill }}
								transition={{ duration: 0.2, ease: "linear" }}
							/>
							{[24, 48, 80, 141].map((gb) => (
								<span
									key={gb}
									className="absolute -top-0.5 h-3.5 w-px bg-foreground/25"
									style={{ left: `${(gb / SCALE_GB) * 100}%` }}
								/>
							))}
						</div>
						<div className="relative mt-1 h-3 font-mono text-[9.5px] text-muted-foreground">
							{[24, 48, 80, 141].map((gb) => (
								<span
									key={gb}
									className="absolute -translate-x-1/2"
									style={{ left: `${(gb / SCALE_GB) * 100}%` }}
								>
									{gb}
								</span>
							))}
						</div>
						<p className="mt-2 font-mono text-[10.5px] text-muted-foreground">
							{precision
								? "70.6B params × 1 byte × 1.2 overhead"
								: "weights × bytes per param × 1.2 overhead"}
						</p>
					</div>
				</div>
			</div>

			<div className="flex min-w-0 flex-col bg-background">
				<PanelTitle
					right={
						<span className="font-mono text-[10.5px] text-muted-foreground">
							{ranked ? "cheapest first" : t >= 2_500 ? "ranking…" : ""}
						</span>
					}
				>
					GPU plans{precision ? ` ≥ ${NEED_GB} GB` : ""}
				</PanelTitle>
				<ul className="space-y-1.5 px-4 py-3">
					{plans.map((p, i) => (
						<motion.li
							layout
							key={p.id}
							initial={false}
							animate={{ opacity: t >= 2_500 + i * 120 ? 1 : 0 }}
							transition={{
								layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
								opacity: { duration: 0.3 },
							}}
							className={cn(
								"flex items-center justify-between gap-3 border bg-card px-3 py-2 font-mono text-[11px]",
								ranked && i === 0 && "border-signal/60 bg-signal/[0.07]",
							)}
						>
							<span className="min-w-0 truncate text-foreground">
								{p.label}
							</span>
							<span className="tabular shrink-0 text-muted-foreground">
								{p.vram} GB ·{" "}
								<span className={cn(ranked && i === 0 && "text-signal")}>
									${p.price.toFixed(2)}/h
								</span>
							</span>
						</motion.li>
					))}
				</ul>
				<div className="mt-auto space-y-1 border-t px-4 py-3 font-mono text-[11px] leading-relaxed">
					<Appear show={t >= 4_200}>
						<ToolLine
							name="hessianlabs.create_server"
							args="{ min_vram_gb: 85 }"
							pending={t < 5_000}
						/>
					</Appear>
					<Appear show={t >= 5_000}>
						<OutLine>
							routed → lambda:gpu_1x_gh200 · Virginia, US · $1.49/h
						</OutLine>
					</Appear>
					<Appear show={t >= 6_200}>
						<OutLine tone="go">
							running · ubuntu-22.04-cuda · 1× GH200 96 GB
						</OutLine>
					</Appear>
					<Appear show={t >= 7_200}>
						<OutLine>
							vllm serve Llama-3.3-70B-Instruct · listening on :8000
						</OutLine>
					</Appear>
				</div>
			</div>
		</div>
	);
}
