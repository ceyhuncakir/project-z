import { useQuery } from "@tanstack/react-query";

import { formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { Reveal, SectionIntro } from "./section";

/** Hetzner CX23 (2 vCPU / 4 GB) at its list price, running all month. */
const EXAMPLE_MONTH_MICROS = 3_990_000;

export function Pricing() {
	const { data: meta } = useQuery(orpc.meta.queryOptions());
	const fee = meta?.feePercent ?? 5;
	const topupFee = meta?.topup.feePercent ?? 5;
	const topupMin = formatUsd(meta?.topup.feeMinMicros ?? 500_000);
	const feeMicros = Math.round((EXAMPLE_MONTH_MICROS * fee) / 100);

	return (
		<section id="pricing" className="scroll-mt-20 border-y bg-card/50">
			<div className="mx-auto max-w-6xl px-5 py-24">
				<SectionIntro
					index="10"
					label="Pricing"
					title="Your provider's price, plus a small fee."
				/>
				<div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-2">
					<Reveal>
						<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
							Servers run in your own accounts, so each provider bills you its
							list price directly — we never mark it up. HessianLabs charges{" "}
							{fee}% of a server's list price, per minute, from prepaid credits.
							Credits are bought through Stripe; top-ups carry a {topupFee}% fee
							(minimum {topupMin}), shown as its own line on the receipt.
						</p>
						<ul className="mt-8 space-y-3 text-sm">
							{[
								"Your provider bills each server to your account",
								`${fee}% fee per server, charged per minute from credits`,
								"One-hour minimum per server",
								"An empty balance blocks new servers, never running ones",
								"Spend limits and server caps per API key",
								"Stopped servers still cost money — delete to stop",
							].map((item) => (
								<li key={item} className="flex gap-3">
									<span className="mt-2 size-1.5 shrink-0 bg-signal" />
									{item}
								</li>
							))}
						</ul>
					</Reveal>
					<Reveal delay={0.1} className="border bg-background">
						<div className="flex items-center justify-between border-b px-6 py-4">
							<p className="label-mono">Example month</p>
							<p className="font-mono text-[11px] text-muted-foreground">
								one server, always on
							</p>
						</div>
						<dl className="divide-y font-mono text-sm">
							{[
								[
									"Hetzner CX23 · 2 vCPU / 4 GB",
									formatUsd(EXAMPLE_MONTH_MICROS),
								],
								[`HessianLabs fee (${fee}%)`, formatUsd(feeMicros)],
								[
									"Total for the month",
									formatUsd(EXAMPLE_MONTH_MICROS + feeMicros),
								],
							].map(([k, v]) => (
								<div key={k} className="flex justify-between px-6 py-4">
									<dt className="text-muted-foreground">{k}</dt>
									<dd className="tabular">{v}</dd>
								</div>
							))}
							<div className="flex justify-between gap-4 bg-card px-6 py-4">
								<dt className="text-muted-foreground">
									Billed by Hetzner, to your card
								</dt>
								<dd className="tabular text-signal">
									{formatUsd(EXAMPLE_MONTH_MICROS)}
								</dd>
							</div>
							<div className="flex justify-between gap-4 bg-card px-6 py-4">
								<dt className="text-muted-foreground">
									Paid from HessianLabs credits
								</dt>
								<dd className="tabular text-signal">{formatUsd(feeMicros)}</dd>
							</div>
						</dl>
					</Reveal>
				</div>
			</div>
		</section>
	);
}
