import { cn } from "@switchyard/ui/lib/utils";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { formatUsd } from "@/lib/format";

export function SectionLabel({
	index,
	label,
	className,
}: {
	index: string;
	label: string;
	className?: string;
}) {
	return (
		<p className={cn("label-mono", className)}>
			<span className="text-signal">{index}</span> / {label}
		</p>
	);
}

/** Eyebrow + heading + optional lede, the opening of every section. */
export function SectionIntro({
	index,
	label,
	title,
	lede,
	className,
	children,
}: {
	index: string;
	label: string;
	title: ReactNode;
	lede?: ReactNode;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<Reveal
			className={cn(
				"flex flex-col justify-between gap-6 md:flex-row md:items-end",
				className,
			)}
		>
			<div>
				<SectionLabel index={index} label={label} />
				<h2 className="mt-4 max-w-2xl text-balance font-medium text-3xl tracking-tight sm:text-[2.15rem]">
					{title}
				</h2>
				{lede && (
					<p className="mt-3 max-w-xl text-muted-foreground text-sm leading-relaxed">
						{lede}
					</p>
				)}
			</div>
			{children}
		</Reveal>
	);
}

/** Fades content up the first time it scrolls into view. */
export function Reveal({
	children,
	className,
	delay = 0,
	as = "div",
}: {
	children: ReactNode;
	className?: string;
	delay?: number;
	as?: "div" | "li";
}) {
	const Component = as === "li" ? motion.li : motion.div;
	return (
		<Component
			className={className}
			initial={{ opacity: 0, y: 14 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-60px" }}
			transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
		>
			{children}
		</Component>
	);
}

/** Counts from 0 to `value` once visible. Server-renders the final value. */
export function CountUp({
	value,
	format = (n) => Math.round(n).toLocaleString("en-US"),
	className,
}: {
	value: number;
	format?: (n: number) => string;
	className?: string;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const inView = useInView(ref, { once: true });
	const [shown, setShown] = useState(value);
	useEffect(() => {
		if (!inView) return;
		const controls = animate(0, value, {
			duration: 1.2,
			ease: [0.22, 1, 0.36, 1],
			onUpdate: setShown,
		});
		return () => controls.stop();
	}, [inView, value]);
	return (
		<span ref={ref} className={cn("tabular", className)}>
			{format(shown)}
		</span>
	);
}

/**
 * `useReducedMotion`, but false until mounted, so the server render and the
 * first client render agree (the server can't know the user's preference).
 */
export function useReducedMotionSafe(): boolean {
	const reduce = useReducedMotion();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted && Boolean(reduce);
}

/** An hourly price: four decimals below a dollar, two above. */
export const hourlyPrice = (micros: number) =>
	formatUsd(micros, { precise: micros < 1_000_000 });
export const hourly = (micros: number) => `${hourlyPrice(micros)}/h`;
