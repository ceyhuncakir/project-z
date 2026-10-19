import {
	BanIcon,
	CreditCardIcon,
	EyeIcon,
	KeyRoundIcon,
	LockIcon,
	ServerCogIcon,
} from "lucide-react";

import { Reveal, SectionIntro } from "./section";

const ITEMS = [
	{
		icon: KeyRoundIcon,
		title: "Spend caps per key",
		body: "Each API key has a lifetime budget. Once it's spent, that key can't create anything else.",
	},
	{
		icon: ServerCogIcon,
		title: "Server limits per key",
		body: "Cap how many machines an agent can run at once, so a loop can't fill a data center.",
	},
	{
		icon: CreditCardIcon,
		title: "Prepaid, with auto top-up",
		body: "Credits are bought up front through Stripe. Opt in to top up from a saved card when the balance runs low.",
	},
	{
		icon: BanIcon,
		title: "Stops at zero",
		body: "At a zero balance servers power off. After 24 hours without credit they're destroyed — never an open-ended bill.",
	},
	{
		icon: EyeIcon,
		title: "Every action logged",
		body: "Creates, power actions and deletions are recorded with the key and client that made them.",
	},
	{
		icon: LockIcon,
		title: "Secrets stay secret",
		body: "API keys are stored as hashes. SSH keys go in through per-server cloud-init, never a shared provider key store.",
	},
];

export function Guardrails() {
	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<SectionIntro
				index="09"
				label="Guardrails"
				title="Give an agent a card without giving it your card."
			/>
			<ul className="mt-12 grid grid-cols-1 gap-px border bg-border sm:grid-cols-2 lg:grid-cols-3">
				{ITEMS.map(({ icon: Icon, title, body }, i) => (
					<Reveal
						as="li"
						key={title}
						delay={(i % 3) * 0.06}
						className="min-w-0 bg-background p-6"
					>
						<Icon className="size-4 text-signal" />
						<h3 className="mt-4 font-medium text-[15px] tracking-tight">
							{title}
						</h3>
						<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
							{body}
						</p>
					</Reveal>
				))}
			</ul>
		</section>
	);
}
