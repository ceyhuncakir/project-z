import { buttonVariants } from "@switchyard/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

export function FinalCta() {
	return (
		<section className="border-t bg-foreground text-background">
			<div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 py-20 md:flex-row md:items-center">
				<div>
					<p className="font-mono text-[11px] text-background/60 uppercase tracking-[0.08em]">
						<span className="text-signal">12</span> / Start
					</p>
					<h2 className="mt-3 max-w-xl text-balance font-medium text-3xl tracking-tight sm:text-4xl">
						Your agent's first server is thirty seconds away.
					</h2>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row">
					<Link
						to="/signup"
						className={buttonVariants({ variant: "signal", size: "xl" })}
					>
						Create an account <ArrowRightIcon />
					</Link>
					<Link
						to="/docs"
						className="inline-flex h-11 items-center justify-center border border-background/25 px-5 text-sm transition-colors hover:bg-background/10"
					>
						Read the docs
					</Link>
				</div>
			</div>
		</section>
	);
}
