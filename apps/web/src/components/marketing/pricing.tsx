import { Reveal, SectionIntro } from "./section";

export function Pricing() {
	return (
		<section id="pricing" className="scroll-mt-20 border-y bg-card/50">
			<div className="mx-auto max-w-6xl px-5 py-24">
				<SectionIntro
					index="10"
					label="Pricing"
					title="Provider prices. Zero markup."
				/>
				<div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-2">
					<Reveal>
						<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
							You pay exactly the hourly price each provider lists. We add 5%
							(minimum $0.50) when you add credits — the same model OpenRouter
							uses for models. Payments run through Stripe; the fee shows as its
							own line on the receipt.
						</p>
						<ul className="mt-8 space-y-3 text-sm">
							{[
								"Billed per minute, one-hour minimum per server",
								"One balance across every provider and region",
								"Optional auto top-up from a saved card",
								"Spend limits and server caps per API key",
								"Stopped servers still bill — delete to stop",
								"Refunds remove the matching credit",
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
							<p className="label-mono">Example top-up</p>
							<p className="font-mono text-[11px] text-muted-foreground">
								Stripe Checkout
							</p>
						</div>
						<dl className="divide-y font-mono text-sm">
							{[
								["Switchyard credits", "$50.00"],
								["Top-up fee (5%)", "$2.50"],
								["Charged to card", "$52.50"],
							].map(([k, v]) => (
								<div key={k} className="flex justify-between px-6 py-4">
									<dt className="text-muted-foreground">{k}</dt>
									<dd className="tabular">{v}</dd>
								</div>
							))}
							<div className="flex justify-between gap-4 bg-card px-6 py-4">
								<dt className="text-muted-foreground">
									Runs a 2 vCPU / 4 GB box for
								</dt>
								<dd className="tabular text-signal">~9,100 hours</dd>
							</div>
							<div className="flex justify-between gap-4 bg-card px-6 py-4">
								<dt className="text-muted-foreground">…or an 80 GB A100 for</dt>
								<dd className="tabular text-signal">~52 hours</dd>
							</div>
						</dl>
					</Reveal>
				</div>
			</div>
		</section>
	);
}
