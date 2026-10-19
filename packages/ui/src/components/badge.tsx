import { cn } from "@switchyard/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const badgeVariants = cva(
	"inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap border px-1.5 font-mono text-[10px] uppercase tracking-wider",
	{
		variants: {
			variant: {
				default: "border-border bg-muted text-muted-foreground",
				signal: "border-signal/30 bg-signal/10 text-signal",
				go: "border-go/30 bg-go/10 text-go",
				warn: "border-warn/40 bg-warn/10 text-warn",
				outline: "border-border text-foreground",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function Badge({
	className,
	variant,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return (
		<span
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
