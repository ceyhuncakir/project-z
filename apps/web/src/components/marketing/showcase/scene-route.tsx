import { cn } from "@switchyard/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { phase } from "./clock";
import { Appear, PanelTitle } from "./parts";

export const ROUTE_DURATION = 8_500;
export const ROUTE_STATIC_T = 6_000;

const CHIPS = ["vcpu ≥ 2", "ram ≥ 4 GB", "continent: EU", "≤ $0.04/h"];

const CANDIDATES = [
	{
		provider: "hetzner",
		plan: "cx23",
		where: "Falkenstein, DE",
		price: "$0.0055",
	},
	{
		provider: "hetzner",
		plan: "cax11",
		where: "Nuremberg, DE",
		price: "$0.0062",
	},
	{
		provider: "contabo",
		plan: "cloud-vps-10",
		where: "Nuremberg, DE",
		price: "$0.0075",
	},
];

// Row centres (percent) of the three candidates the router will try.
const ROW_Y = [16.67, 50, 83.33];

/** Cubic from the router (left middle) to a candidate row, in pixels. */
const curve = (w: number, h: number, yPct: number) => {
	const y = (h * yPct) / 100;
	return `M0 ${h / 2} C ${w / 2} ${h / 2}, ${w / 2} ${y}, ${w} ${y}`;
};

/** Tracks an element's size so the SVG can use 1:1 pixel coordinates. */
function useSize<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [size, setSize] = useState({ w: 100, h: 100 });
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			if (entry)
				setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, size] as const;
}

/** Point on the cubic from (0,50) to (100,y) — matches `curve`. */
function pointOn(y: number, p: number) {
	const u = 1 - p;
	const x = 3 * u * u * p * 50 + 3 * u * p * p * 50 + p * p * p * 100;
	const yy =
		u * u * u * 50 + 3 * u * u * p * 50 + 3 * u * p * p * y + p * p * p * y;
	return { x, y: yy };
}

const PULSES = [
	{ row: 0, start: 2_400 },
	{ row: 1, start: 3_700 },
];
const PULSE_MS = 800;

export function SceneRoute({ t }: { t: number }) {
	const [linesRef, { w, h }] = useSize<HTMLDivElement>();
	const failed = t >= 3_200;
	const routed = t >= 4_500;
	const pulse = PULSES.find((p) => t >= p.start && t < p.start + PULSE_MS);

	return (
		<div className="flex h-full flex-col bg-card">
			<PanelTitle
				right={
					<span className="font-mono text-[10.5px] text-muted-foreground">
						create_server
					</span>
				}
			>
				Router
			</PanelTitle>
			<div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-3 font-mono text-[11px]">
				<span className="label-mono mr-1">request</span>
				{CHIPS.map((c, i) => (
					<Appear key={c} show={t >= 300 + i * 220}>
						<span className="border bg-background px-1.5 py-0.5">{c}</span>
					</Appear>
				))}
			</div>

			<div className="grid flex-1 grid-cols-[6.5rem_minmax(2.5rem,1fr)_minmax(0,2.2fr)] items-stretch gap-0 px-4 py-5 sm:grid-cols-[8.5rem_minmax(3rem,1fr)_minmax(0,2fr)]">
				<div className="flex items-center">
					<Appear show={t >= 1_100} className="w-full">
						<div className="border bg-background px-3 py-2.5">
							<p className="font-medium text-[12.5px]">switchyard</p>
							<p className="font-mono text-[10px] text-muted-foreground">
								{t < 2_300
									? "ranking every match…"
									: routed
										? "routed"
										: "trying…"}
							</p>
						</div>
					</Appear>
				</div>

				<div ref={linesRef} className="relative">
					<svg
						viewBox={`0 0 ${w} ${h}`}
						className="absolute inset-0 h-full w-full overflow-visible"
						aria-hidden="true"
					>
						{ROW_Y.map((y, i) => (
							<motion.path
								key={y}
								d={curve(w, h, y)}
								fill="none"
								stroke="var(--border)"
								strokeWidth={1.25}
								initial={false}
								animate={{
									pathLength: phase(t, 1_300 + i * 140, 600),
									opacity: routed && i !== 1 ? 0.5 : 1,
								}}
								transition={{ duration: 0.25 }}
							/>
						))}
						{failed && (
							<path
								d={curve(w, h, ROW_Y[0] ?? 16.67)}
								fill="none"
								stroke="var(--destructive)"
								strokeWidth={1.25}
								strokeDasharray="3 4"
							/>
						)}
						{routed && (
							<motion.path
								d={curve(w, h, ROW_Y[1] ?? 50)}
								fill="none"
								stroke="var(--signal)"
								strokeWidth={2}
								initial={{ pathLength: 0 }}
								animate={{ pathLength: 1 }}
								transition={{ duration: 0.45, ease: "easeOut" }}
							/>
						)}
					</svg>
					<AnimatePresence>
						{pulse && (
							<motion.span
								key={pulse.row}
								className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_0_4px_color-mix(in_oklch,var(--signal)_25%,transparent)]"
								style={{
									left: `${pointOn(ROW_Y[pulse.row] ?? 50, phase(t, pulse.start, PULSE_MS)).x}%`,
									top: `${pointOn(ROW_Y[pulse.row] ?? 50, phase(t, pulse.start, PULSE_MS)).y}%`,
								}}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
							/>
						)}
					</AnimatePresence>
				</div>

				<ol className="grid grid-rows-3 gap-2">
					{CANDIDATES.map((c, i) => {
						const isFail = i === 0 && failed;
						const isWin = i === 1 && routed;
						return (
							<motion.li
								key={c.plan}
								initial={false}
								animate={{
									opacity:
										t >= 1_400 + i * 140 ? (routed && !isWin ? 0.55 : 1) : 0,
									x: t >= 1_400 + i * 140 ? 0 : 8,
								}}
								transition={{ duration: 0.35 }}
								className={cn(
									"flex min-w-0 items-center justify-between gap-2 border bg-background px-3 font-mono text-[11px]",
									isWin && "border-signal/60 bg-signal/[0.07]",
									isFail && "border-destructive/40",
								)}
							>
								<span
									className={cn(
										"min-w-0 truncate",
										isFail && "text-muted-foreground line-through",
									)}
								>
									<span className="text-foreground">{c.provider}</span>
									<span className="hidden text-muted-foreground sm:inline">
										{" "}
										· {c.plan} · {c.where}
									</span>
								</span>
								<span className="tabular shrink-0">
									{isFail ? (
										<span className="text-destructive">out of capacity</span>
									) : isWin ? (
										<span className="text-signal">● routed {c.price}</span>
									) : (
										<span className="text-muted-foreground">{c.price}/h</span>
									)}
								</span>
							</motion.li>
						);
					})}
				</ol>
			</div>

			<div className="min-h-11 border-t px-4 py-3 font-mono text-[11px]">
				<Appear show={t >= 5_300}>
					<p>
						<span className="text-go">✓</span> provisioned on hetzner:cax11
						after 1 fallback ·{" "}
						<span className="text-muted-foreground">
							your agent didn't have to handle a thing
						</span>
					</p>
				</Appear>
			</div>
		</div>
	);
}
