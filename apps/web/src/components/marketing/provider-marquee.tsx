import { cn } from "@switchyard/ui/lib/utils";

import { type SiteProvider, site } from "@/lib/site";

const KEYFRAMES = "@keyframes sy-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}";

function Row({
	label,
	providers,
	reverse,
	duration,
}: {
	label: string;
	providers: SiteProvider[];
	reverse?: boolean;
	duration: number;
}) {
	// Four copies: the -50% translate then loops seamlessly at any width.
	const items = [...providers, ...providers, ...providers, ...providers];
	return (
		<div className="flex items-center gap-6">
			<span className="label-mono hidden w-28 shrink-0 sm:block">{label}</span>
			<div className="group relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
				<ul
					className="flex w-max items-center gap-x-10 py-2 group-hover:[animation-play-state:paused] motion-reduce:[animation:none]"
					style={{
						animation: `sy-marquee ${duration}s linear infinite`,
						animationDirection: reverse ? "reverse" : "normal",
					}}
				>
					{items.map((p, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: the list repeats on purpose
							key={`${p.id}-${i}`}
							aria-hidden={i >= providers.length}
							className="whitespace-nowrap font-medium text-[17px] text-foreground/70 tracking-tight"
						>
							{p.name}
							{p.preview && (
								<sup className="ml-1 font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
									preview
								</sup>
							)}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

/** Two endless rows of provider names: general clouds and GPU clouds. */
export function ProviderMarquee({ className }: { className?: string }) {
	return (
		<section className={cn("border-b", className)} aria-label="Supported providers">
			<style>{KEYFRAMES}</style>
			<div className="mx-auto max-w-6xl space-y-1 px-5 py-6">
				<Row label="General clouds" providers={site.cloudProviders} duration={48} />
				<Row label="GPU clouds" providers={site.gpuProviders} duration={40} reverse />
				<p className="pt-2 font-mono text-[10.5px] text-muted-foreground">
					<span className="text-signal">preview</span> providers are simulated until their live adapters ship —
					same API, indicative prices.
				</p>
			</div>
		</section>
	);
}
