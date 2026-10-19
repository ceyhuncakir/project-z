import { cn } from "@switchyard/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

const enter = {
	initial: { opacity: 0, y: 6 },
	animate: { opacity: 1, y: 0 },
	exit: { opacity: 0, y: -4 },
	transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
};

/** Renders children only once `show` is true, with a soft entrance. */
export function Appear({
	show,
	children,
	className,
}: {
	show: boolean;
	children: ReactNode;
	className?: string;
}) {
	return (
		<AnimatePresence initial={false}>
			{show && (
				<motion.div {...enter} className={className}>
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

export function UserLine({ text, cursor }: { text: string; cursor?: boolean }) {
	return (
		<p className="text-foreground">
			<span className="text-signal">›</span> {text}
			{cursor && (
				<span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-blink bg-foreground" />
			)}
		</p>
	);
}

export function ToolLine({
	name,
	args,
	pending,
}: {
	name: string;
	args?: string;
	pending?: boolean;
}) {
	return (
		<p className="truncate pt-1">
			<span className={cn("text-signal", pending && "animate-pulse-dot")}>
				●
			</span>{" "}
			<span className="text-foreground">{name}</span>{" "}
			{args && <span className="text-muted-foreground">{args}</span>}
		</p>
	);
}

export function OutLine({
	children,
	tone,
}: {
	children: ReactNode;
	tone?: "go" | "muted" | "bad";
}) {
	return (
		<p
			className={cn(
				"truncate pl-4",
				tone === "go" && "text-go",
				tone === "muted" && "text-muted-foreground",
				tone === "bad" && "text-destructive",
				!tone && "text-foreground/80",
			)}
		>
			<span className="text-muted-foreground">⎿</span> {children}
		</p>
	);
}

export function PanelTitle({
	children,
	right,
}: {
	children: ReactNode;
	right?: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between border-b px-4 py-2.5">
			<span className="label-mono">{children}</span>
			{right}
		</div>
	);
}
