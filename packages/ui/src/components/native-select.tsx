import { cn } from "@switchyard/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";

function NativeSelect({
	className,
	children,
	...props
}: React.ComponentProps<"select">) {
	return (
		<div className={cn("relative", className)}>
			<select
				data-slot="native-select"
				className="h-8 w-full min-w-0 cursor-pointer appearance-none border border-input bg-transparent py-1 pr-8 pl-2.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
				{...props}
			>
				{children}
			</select>
			<ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
		</div>
	);
}

export { NativeSelect };
