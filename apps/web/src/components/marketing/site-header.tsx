import { buttonVariants } from "@switchyard/ui/components/button";
import { Link } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

import { Logo } from "../brand";
import { ThemeToggle } from "../theme-toggle";

const NAV = [
	{ to: "/catalog", label: "Catalog" },
	{ to: "/docs", label: "Docs" },
	{ to: "/", hash: "pricing", label: "Pricing" },
] as const;

export function SiteHeader() {
	const { data: session } = authClient.useSession();
	return (
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
	);
}
