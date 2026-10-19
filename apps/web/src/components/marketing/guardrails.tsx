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
		body: "Each API key has a lifetime budget, measured at provider list prices. Once it's spent, that key can't create anything else.",
	},
	{
		icon: ServerCogIcon,
		title: "Server limits per key",
		body: "Cap how many machines an agent can run at once, so a loop can't fill a data center.",
	},
	{
		icon: CreditCardIcon,
		title: "Prepaid fee, with auto top-up",
		body: "HessianLabs's fee comes from credits bought up front through Stripe. Opt in to top up from a saved card when the balance runs low.",
	},
	{
		icon: BanIcon,
		title: "Your servers stay yours",
		body: "An empty balance only blocks new servers. Running ones are never powered off or deleted over our fee — they live in your account.",
	},
	{
		icon: EyeIcon,
		title: "Every action logged",
		body: "Creates, power actions and deletions are recorded with the key and client that made them.",
	},
	{
		icon: LockIcon,
		title: "Secrets stay secret",
		body: "Cloud tokens are encrypted (AES-256-GCM) and never shown again; API keys are stored as hashes. SSH keys go in through cloud-init, never your account's key store.",
	},
];

export function Guardrails() {
	return (
		<section className="mx-auto max-w-6xl px-5 py-24">
			<SectionIntro
				index="09"
				label="Guardrails"
				title="Give an agent a budget, not your whole cloud account."
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
