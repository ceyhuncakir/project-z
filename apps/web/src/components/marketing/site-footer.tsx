import { Link } from "@tanstack/react-router";

import { site } from "@/lib/site";

import { Logo } from "../brand";

export function SiteFooter() {
	return (
		<footer className="border-t">
			<div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-[1fr_auto]">
				<div className="space-y-3">
					<Logo />
					<p className="max-w-xs text-muted-foreground text-sm">
						{site.tagline}. Pay by the minute, from one balance.
					</p>
				</div>
				<div className="grid grid-cols-2 gap-x-12 gap-y-2 text-[13px] text-muted-foreground">
					<Link to="/catalog" className="hover:text-foreground">
						Catalog
					</Link>
					<Link to="/docs" className="hover:text-foreground">
						MCP & API docs
					</Link>
					<Link to="/signup" className="hover:text-foreground">
						Create account
					</Link>
					<Link to="/login" className="hover:text-foreground">
						Sign in
					</Link>
				</div>
			</div>
			<div className="border-t">
				<p className="mx-auto max-w-6xl px-5 py-4 font-mono text-[11px] text-muted-foreground">
					© {new Date().getFullYear()} {site.name}. Provider names are
					trademarks of their owners.
				</p>
			</div>
		</footer>
	);
}
