import { cn } from "@switchyard/ui/lib/utils";
import { useState } from "react";

import { CopyButton } from "./copy-button";

export interface CodeTab {
	label: string;
	code: string;
	/** Shown above the code, e.g. a file path. */
	hint?: string;
}

/** Monospace code panel with optional tabs and a copy button. */
export function CodeBlock({
	tabs,
	className,
	compact,
}: {
	tabs: CodeTab[];
	className?: string;
	compact?: boolean;
}) {
	const [active, setActive] = useState(0);
	const tab = tabs[active] ?? tabs[0];
	if (!tab) return null;
	return (
		<div className={cn("min-w-0 border bg-card", className)}>
			<div className="flex items-center justify-between gap-2 border-b pr-1.5">
				<div className="flex min-w-0 overflow-x-auto" role="tablist">
					{tabs.map((t, i) => (
						<button
							key={t.label}
							type="button"
							role="tab"
							aria-selected={i === active}
							onClick={() => setActive(i)}
							className={cn(
								"-mb-px shrink-0 border-transparent border-b-2 px-3 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground",
								i === active && "border-signal text-foreground",
								tabs.length === 1 && "cursor-default",
							)}
						>
							{t.label}
						</button>
					))}
				</div>
				<CopyButton value={tab.code} />
			</div>
			{tab.hint && (
				<div className="border-b px-4 py-1.5 font-mono text-[11px] text-muted-foreground">
					{tab.hint}
				</div>
			)}
			<pre
				className={cn(
					"overflow-x-auto px-4 font-mono text-[12px] leading-relaxed",
					compact ? "py-3" : "py-4",
				)}
			>
				<code>{tab.code}</code>
			</pre>
		</div>
	);
}
