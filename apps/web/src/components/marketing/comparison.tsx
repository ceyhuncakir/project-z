import { CheckIcon, MinusIcon } from "lucide-react";

import { Reveal, SectionIntro } from "./section";

const ROWS: [
	topic: string,
	direct: string,
	hessianlabs: string,
	winner: "direct" | "hessianlabs" | "tie",
][] = [
	[
		"Accounts to open",
		"One per provider, each with KYC and a card",
		"The same ones, each connected once with a token",
		"tie",
	],
	[
		"Billing",
		"Each provider bills you directly",
		"Each provider still bills you; HessianLabs's fee comes from prepaid credits",
		"direct",
	],
	[
		"APIs to integrate",
		"A different API, SDK and auth scheme each",
		"One MCP endpoint and one REST API",
		"hessianlabs",
	],
	[
		"Finding the cheapest fit",
		"Compare pricing pages by hand",
		"Live catalog across your accounts, cheapest match first",
		"hessianlabs",
	],
	[
		"Out of capacity",
		"Your code handles the error",
		"Automatic fallback to the next match",
		"hessianlabs",
	],
	[
		"Agent guardrails",
		"Agents hold your full cloud tokens",
		"Per-key spend caps and server limits",
		"hessianlabs",
	],
	[
		"GPUs",
		"Available today, with separate vendors and workflows",
		"Coming soon — the same call, plus min_vram_gb",
		"direct",
	],
	["Prices", "List price", "List price, plus a small fee per server", "direct"],
	[
		"Provider-specific features",
		"Everything: volumes, networks, load balancers",
		"Servers only, for now",
		"direct",
	],
];

export function Comparison() {
	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<SectionIntro
				index="07"
				label="Compared"
				title="Going direct vs. going through the yard."
				lede="Direct accounts still make sense for deep, single-provider setups. For agents that need a machine now, on whichever of your clouds fits, the trade-off looks like this."
			/>
			<Reveal className="mt-10 overflow-x-auto border">
				<table className="w-full min-w-[640px] text-sm">
					<thead>
						<tr className="border-b bg-card text-left">
							<th className="label-mono w-[26%] px-4 py-3 font-normal" />
							<th className="label-mono w-[37%] px-4 py-3 font-normal">
								Going direct
							</th>
							<th className="label-mono w-[37%] px-4 py-3 font-normal">
								<span className="text-signal">●</span> HessianLabs
							</th>
						</tr>
					</thead>
					<tbody className="divide-y">
						{ROWS.map(([topic, direct, yard, winner]) => (
							<tr key={topic}>
								<td className="px-4 py-3.5 font-medium">{topic}</td>
								<td className="px-4 py-3.5 text-muted-foreground">
									<span className="inline-flex items-start gap-2">
										{winner !== "hessianlabs" ? (
											<CheckIcon className="mt-0.5 size-3.5 shrink-0 text-go" />
										) : (
											<MinusIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
										)}
										{direct}
									</span>
								</td>
								<td className="px-4 py-3.5">
									<span className="inline-flex items-start gap-2">
										{winner !== "direct" ? (
											<CheckIcon className="mt-0.5 size-3.5 shrink-0 text-signal" />
										) : (
											<MinusIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
										)}
										{yard}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Reveal>
		</section>
	);
}
