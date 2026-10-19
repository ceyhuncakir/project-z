import { Link } from "@tanstack/react-router";

import { API_URL } from "@/lib/api-url";
import { site } from "@/lib/site";

import { Logo } from "../brand";

type FooterLink = { label: string } & (
	| { to: "/catalog" | "/docs" | "/signup" | "/login" | "/dashboard"; hash?: string }
	| { to: "/"; hash: string }
	| { href: string }
);

const COLUMNS: { title: string; links: FooterLink[] }[] = [
	{
		title: "Product",
		links: [
			{ label: "Catalog", to: "/catalog" },
			{ label: "GPU clouds", to: "/", hash: "gpu" },
			{ label: "Pricing", to: "/", hash: "pricing" },
			{ label: "Dashboard", to: "/dashboard" },
		],
	},
	{
		title: "Developers",
		links: [
			{ label: "MCP quickstart", to: "/docs", hash: "quickstart" },
			{ label: "MCP tools", to: "/docs", hash: "tools" },
			{ label: "REST API", to: "/docs", hash: "rest" },
			{ label: "API reference", href: `${API_URL}/v1/docs` },
		],
	},
	{
		title: "Account",
		links: [
			{ label: "Create account", to: "/signup" },
			{ label: "Sign in", to: "/login" },
			{ label: "Billing & credits", to: "/dashboard" },
		],
	},
];

export function SiteFooter() {
	return (
		<footer className="border-t">
			<div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.3fr_repeat(4,1fr)]">
				<div className="space-y-3">
					<Logo />
					<p className="max-w-xs text-muted-foreground text-sm">
						{site.tagline}. Pay by the minute, from one balance.
					</p>
				</div>
				{COLUMNS.map((col) => (
					<div key={col.title}>
						<p className="label-mono">{col.title}</p>
						<ul className="mt-4 space-y-2 text-[13px] text-muted-foreground">
							{col.links.map((l) => (
								<li key={l.label}>
									{"href" in l ? (
										<a href={l.href} target="_blank" rel="noreferrer" className="hover:text-foreground">
											{l.label}
										</a>
									) : (
										<Link to={l.to} hash={l.hash} className="hover:text-foreground">
											{l.label}
										</Link>
									)}
								</li>
							))}
						</ul>
					</div>
				))}
				<div>
					<p className="label-mono">Providers</p>
					<ul className="mt-4 space-y-2 text-[13px] text-muted-foreground">
						<li>
							<Link to="/catalog" className="hover:text-foreground">
								{site.cloudProviders.length} general clouds
							</Link>
						</li>
						<li>
							<Link to="/" hash="gpu" className="hover:text-foreground">
								{site.gpuProviders.length} GPU clouds
							</Link>
						</li>
						<li className="text-[12px]">
							{site.cloudProviders.filter((p) => !p.preview).length} live ·{" "}
							{site.providers.length - site.cloudProviders.filter((p) => !p.preview).length} preview
						</li>
					</ul>
				</div>
			</div>
			<div className="border-t">
				<p className="mx-auto max-w-6xl px-5 py-4 font-mono text-[11px] text-muted-foreground">
					© {new Date().getFullYear()} {site.name}. Provider names are trademarks of their owners; Switchyard is not
					affiliated with them.
				</p>
			</div>
		</footer>
	);
}
