import { buttonVariants } from "@switchyard/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { CountUp } from "./section";
import { TrackBackground } from "./track-background";

export const providersQuery = orpc.catalog.providers.queryOptions();

export function Hero() {
	const { data: all } = useQuery(providersQuery);
	const meta = useQuery(orpc.meta.queryOptions());
	// Stats cover the clouds you can connect today, not the coming-soon ones.
	const data = all?.filter((p) => p.connectable);
	const regions = data?.reduce((n, p) => n + p.regions, 0) ?? 0;
	const plans = data?.reduce((n, p) => n + p.plans, 0) ?? 0;
	const from = data?.reduce<number | null>(
		(min, p) =>
			p.fromHourlyMicros !== null && (min === null || p.fromHourlyMicros < min)
				? p.fromHourlyMicros
				: min,
		null,
	);

	const stats = [
		{ label: "clouds", value: data?.length ?? 6 },
		{ label: "regions", value: regions },
		{ label: "plans", value: plans },
	];

	return (
		<section className="relative overflow-hidden border-b">
			<TrackBackground />
			<div className="relative mx-auto max-w-4xl px-5 pt-20 pb-16 text-center sm:pt-28 sm:pb-20">
				<p className="label-mono inline-flex items-center gap-2 border bg-background px-2.5 py-1">
					<span className="size-1.5 rounded-full bg-signal" />
					The router for hosting
				</p>
				<h1 className="mx-auto mt-6 max-w-3xl text-balance font-medium text-[2.6rem] leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl">
					Give your agent a server room.
				</h1>
				<p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground leading-relaxed sm:text-lg">
					One MCP endpoint in front of your own cloud accounts — Hetzner,
					DigitalOcean, Vultr, Linode, OVHcloud and Scaleway today, GPU clouds
					soon. Your agent says what it needs; HessianLabs finds the cheapest
					machine that fits, launches it in your account, and tears it down when
					the job is done. Your provider bills you as usual; we charge{" "}
					{meta.data?.feePercent ?? 5}% of the server's price.
				</p>
				<div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
					<Link
						to="/signup"
						className={buttonVariants({ variant: "signal", size: "xl" })}
					>
						Get started <ArrowRightIcon />
					</Link>
					<Link
						to="/catalog"
						className={buttonVariants({ variant: "outline", size: "xl" })}
					>
						Browse the catalog
					</Link>
				</div>
				<dl className="mx-auto mt-12 grid max-w-xl grid-cols-2 gap-px border bg-border sm:grid-cols-4">
					{stats.map((s) => (
						<div
							key={s.label}
							className="bg-background/90 px-4 py-3 backdrop-blur-sm"
						>
							<dt className="label-mono">{s.label}</dt>
							<dd className="mt-1 font-medium text-2xl tracking-tight">
								<CountUp value={s.value} />
							</dd>
						</div>
					))}
					<div className="bg-background/90 px-4 py-3 backdrop-blur-sm">
						<dt className="label-mono">from</dt>
						<dd className="tabular mt-1 font-medium text-2xl tracking-tight">
							{from ? formatUsd(from, { precise: true }) : "—"}
							<span className="text-muted-foreground text-sm">/h</span>
						</dd>
					</div>
				</dl>
			</div>
		</section>
	);
}
