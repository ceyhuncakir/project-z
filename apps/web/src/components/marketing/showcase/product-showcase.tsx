import { cn } from "@switchyard/ui/lib/utils";
import { AnimatePresence, motion, useInView, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useReducedMotionSafe } from "../section";
import { useSceneClock } from "./clock";
import { LLM_DURATION, LLM_STATIC_T, SceneLlm } from "./scene-llm";
import {
	PROVISION_DURATION,
	PROVISION_STATIC_T,
	SceneProvision,
} from "./scene-provision";
import { ROUTE_DURATION, ROUTE_STATIC_T, SceneRoute } from "./scene-route";

const SCENES = [
	{
		id: "provision",
		label: "Provision",
		caption: "An agent asks for a box, uses it, and deletes it",
		duration: PROVISION_DURATION,
		staticT: PROVISION_STATIC_T,
		Scene: SceneProvision,
	},
	{
		id: "route",
		label: "Route & fallback",
		caption: "The cheapest plan is sold out — the router moves on",
		duration: ROUTE_DURATION,
		staticT: ROUTE_STATIC_T,
		Scene: SceneRoute,
	},
	{
		id: "llm",
		label: "Serve an LLM · soon",
		caption:
			"Size a model, rank GPU plans, get a CUDA box (GPU clouds coming soon)",
		duration: LLM_DURATION,
		staticT: LLM_STATIC_T,
		Scene: SceneLlm,
	},
] as const;

/**
 * A looping, scripted product demo. Scenes auto-advance; hovering pauses,
 * scrolling away pauses, and reduced motion shows a still of each scene.
 */
export function ProductShowcase({ className }: { className?: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref, { amount: 0.35 });
	const reduce = useReducedMotionSafe();
	const [active, setActive] = useState(0);
	const [run, setRun] = useState(0);
	const [hovered, setHovered] = useState(false);
	const scene = SCENES[active] ?? SCENES[0];

	// Scenes always play to the end while visible; hovering only holds the
	// finished frame instead of advancing, so clicking a tab never freezes it.
	const playing = inView && !reduce;
	const [held, setHeld] = useState(false);
	const hoveredRef = useRef(false);
	hoveredRef.current = hovered;
	const advance = useCallback(() => {
		setHeld(false);
		setActive((a) => (a + 1) % SCENES.length);
		setRun((r) => r + 1);
	}, []);
	const { t, progress } = useSceneClock(
		scene.duration,
		playing,
		`${active}:${run}`,
		() => (hoveredRef.current ? setHeld(true) : advance()),
	);
	useEffect(() => {
		if (held && !hovered) advance();
	}, [held, hovered, advance]);
	const Scene = scene.Scene;

	return (
		<div
			ref={ref}
			className={cn(
				"overflow-hidden border bg-card shadow-[0_24px_60px_-30px_rgb(0_0_0/0.25)]",
				className,
			)}
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
		>
			<div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
				<div className="flex items-center gap-2">
					<span className="size-2.5 rounded-full bg-border" />
					<span className="size-2.5 rounded-full bg-border" />
					<span className="size-2.5 rounded-full bg-border" />
					<span className="ml-2 hidden font-mono text-[11px] text-muted-foreground sm:inline">
						hessianlabs — {scene.caption.toLowerCase()}
					</span>
				</div>
				<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
					<span
						className={cn(
							"size-1.5 rounded-full bg-go",
							playing && !held && "animate-pulse-dot",
						)}
					/>
					{reduce ? "still" : playing && !held ? "live demo" : "paused"}
				</span>
			</div>

			<div
				role="tablist"
				aria-label="Product demo scenes"
				className="grid grid-cols-3 border-b"
			>
				{SCENES.map((s, i) => (
					<button
						key={s.id}
						type="button"
						role="tab"
						aria-selected={i === active}
						onClick={() => {
							setHeld(false);
							setActive(i);
							setRun((r) => r + 1);
						}}
						className={cn(
							"relative px-3 py-2.5 text-left transition-colors sm:px-4",
							i === active ? "bg-background" : "hover:bg-muted/40",
							i > 0 && "border-l",
						)}
					>
						<span className="block font-mono text-[10px] text-muted-foreground">
							0{i + 1}
						</span>
						<span
							className={cn(
								"block truncate font-medium text-[12.5px] sm:text-[13px]",
								i !== active && "text-muted-foreground",
							)}
						>
							{s.label}
						</span>
						<span className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent">
							{i === active && (
								<ProgressBar progress={progress} full={Boolean(reduce)} />
							)}
						</span>
					</button>
				))}
			</div>

			<div className="relative h-[560px] sm:h-[440px] md:h-[400px]">
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={`${scene.id}:${run}`}
						className="absolute inset-0"
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
					>
						<Scene t={reduce ? scene.staticT : t} />
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
}

function ProgressBar({
	progress,
	full,
}: {
	progress: ReturnType<typeof useSceneClock>["progress"];
	full: boolean;
}) {
	const scaleX = useTransform(progress, (p) => (full ? 1 : p));
	return (
		<motion.span
			className="absolute inset-0 origin-left bg-signal"
			style={{ scaleX }}
		/>
	);
}
