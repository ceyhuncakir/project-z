import { buttonVariants } from "@switchyard/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";

import { Logo } from "../brand";
import { ThemeToggle } from "../theme-toggle";

const NAV = [
	{ to: "/catalog", label: "Catalog" },
	{ to: "/", hash: "gpu", label: "GPUs" },
	{ to: "/docs", label: "Docs" },
	{ to: "/", hash: "pricing", label: "Pricing" },
] as const;

export function SiteHeader() {
	const { data: session } = authClient.useSession();
	return (
		<>
			<Link
				to="/"
				hash="gpu"
				className="group flex items-center justify-center gap-2 border-b bg-foreground px-4 py-2 text-center font-mono text-[11px] text-background/80 transition-colors hover:text-background"
			>
				<span className="text-signal">Soon</span>
				<span className="text-background/40">·</span>
				GPU clouds for LLM hosting
				<ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
			</Link>
			<header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
				<div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5">
					<div className="flex items-center gap-8">
						<Logo />
						<nav className="hidden items-center gap-6 text-[13px] text-muted-foreground md:flex">
							{NAV.map((item) => (
								<Link
									key={item.label}
									to={item.to}
									hash={"hash" in item ? item.hash : undefined}
									className="transition-colors hover:text-foreground"
									activeProps={{ className: "text-foreground" }}
									activeOptions={{ exact: true, includeHash: true }}
								>
									{item.label}
								</Link>
							))}
						</nav>
					</div>
					<div className="flex items-center gap-1.5">
						<ThemeToggle />
						{session ? (
							<Link
								to="/dashboard"
								className={buttonVariants({ variant: "signal", size: "sm" })}
							>
								Dashboard
							</Link>
						) : (
							<>
								<Link
									to="/login"
									className={buttonVariants({ variant: "ghost", size: "sm" })}
								>
									Sign in
								</Link>
								<Link
									to="/signup"
									className={buttonVariants({ variant: "signal", size: "sm" })}
								>
									Get started
								</Link>
							</>
						)}
					</div>
				</div>
			</header>
		</>
	);
}
