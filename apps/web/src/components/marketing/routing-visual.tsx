import { cn } from "@switchyard/ui/lib/utils";

const ROWS = [
	{
		provider: "hetzner",
		plan: "cx23",
		where: "Falkenstein, DE",
		price: "$0.0055",
		state: "selected",
	},
	{
		provider: "hetzner",
		plan: "cax11",
		where: "Nuremberg, DE",
		price: "$0.0062",
		state: "fallback",
	},
	{
		provider: "contabo",
		plan: "cloud-vps-10",
		where: "Nuremberg, DE",
		price: "$0.0075",
		state: "fallback",
	},
] as const;

/** Bento illustration: a request fanning out to ranked candidates. */
export function RoutingVisual() {
	return (
		<div className="font-mono text-[11px]">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="label-mono mr-1">request</span>
				{["vcpu ≥ 2", "ram ≥ 4 GB", "continent: EU", "≤ $0.04/h"].map((c) => (
					<span key={c} className="border bg-background px-1.5 py-0.5">
						{c}
					</span>
				))}
			</div>
			<div className="my-3 ml-3 h-4 border-l border-dashed" />
			<div className="divide-y border bg-background">
				{ROWS.map((r, i) => (
					<div
						key={r.plan}
						className={cn(
							"grid grid-cols-[1.25rem_1fr_auto] items-center gap-2 px-3 py-2 sm:grid-cols-[1.25rem_7rem_1fr_auto_5.5rem]",
							r.state === "selected" && "bg-signal/[0.07]",
						)}
					>
						<span className="text-muted-foreground">{i + 1}</span>
						<span className="text-foreground">{r.provider}</span>
						<span className="hidden truncate text-muted-foreground sm:block">
							{r.plan} · {r.where}
						</span>
						<span className="tabular text-foreground">{r.price}/h</span>
						<span
							className={cn(
								"hidden text-right sm:block",
								r.state === "selected"
									? "text-signal"
									: "text-muted-foreground",
							)}
						>
							{r.state === "selected" ? "● routed" : "fallback"}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
