import { Button, buttonVariants } from "@switchyard/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@switchyard/ui/components/dropdown-menu";
import { cn } from "@switchyard/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	ActivityIcon,
	ArrowLeftIcon,
	BellIcon,
	BookOpenIcon,
	CheckIcon,
	CloudIcon,
	CreditCardIcon,
	DatabaseIcon,
	GaugeIcon,
	KeyRoundIcon,
	LayoutGridIcon,
	LogOutIcon,
	MenuIcon,
	MonitorSmartphoneIcon,
	PlusIcon,
	ReceiptIcon,
	ServerIcon,
	SettingsIcon,
	ShieldCheckIcon,
	TableIcon,
	TerminalIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

import { Logo } from "../brand";
import { ThemeToggle } from "../theme-toggle";

const NAV = [
	{ to: "/dashboard", label: "Overview", icon: LayoutGridIcon },
	{ to: "/servers", label: "Servers", icon: ServerIcon },
	{ to: "/plans", label: "Catalog", icon: TableIcon },
	{ to: "/providers", label: "Providers", icon: CloudIcon },
	{ to: "/credits", label: "Credits", icon: CreditCardIcon },
	{ to: "/keys", label: "API keys", icon: KeyRoundIcon },
	{ to: "/ssh-keys", label: "SSH keys", icon: TerminalIcon },
	{ to: "/activity", label: "Activity", icon: ActivityIcon },
] as const;

/** Replaces NAV in the sidebar on /settings pages: you, then the account you're in. */
const SETTINGS_YOU = [
	{ to: "/settings/profile", label: "Profile", icon: UserIcon },
	{ to: "/settings/security", label: "Security", icon: ShieldCheckIcon },
	{ to: "/settings/sessions", label: "Sessions", icon: MonitorSmartphoneIcon },
	{ to: "/settings/notifications", label: "Notifications", icon: BellIcon },
	{ to: "/settings/privacy", label: "Data & privacy", icon: DatabaseIcon },
] as const;
const SETTINGS_ACCOUNT = [
	{ to: "/settings/team", label: "Team", icon: UsersIcon },
	{ to: "/settings/guardrails", label: "Guardrails", icon: GaugeIcon },
	{ to: "/settings/billing", label: "Billing details", icon: ReceiptIcon },
] as const;
const SETTINGS_NAV = [...SETTINGS_YOU, ...SETTINGS_ACCOUNT];

const SECONDARY = [
	{ to: "/settings", label: "Settings", icon: SettingsIcon },
	{ to: "/docs", label: "Docs", icon: BookOpenIcon },
] as const;

export function useOverview() {
	return useQuery(
		orpc.account.overview.queryOptions({ refetchInterval: 30_000 }),
	);
}

/** Accounts this person can act in, and the one this session uses. */
export function useAccounts() {
	return useQuery(orpc.team.accounts.queryOptions());
}

export function accountName(a: { personal: boolean; ownerName: string }) {
	return a.personal ? "Your account" : `${a.ownerName}'s account`;
}

/**
 * The active account's name, for headings that say whose settings these are,
 * or mid-sentence ("in your account") with `inSentence`.
 */
export function useActiveAccountName(opts: { inSentence?: boolean } = {}) {
	const { data } = useAccounts();
	const active = data?.accounts.find(
		(a) => a.accountId === data.active.accountId,
	);
	const name = active ? accountName(active) : "This account";
	return opts.inSentence && (!active || active.personal)
		? name.toLowerCase()
		: name;
}

function useInSettings() {
	return useRouterState({
		select: (s) => s.location.pathname.startsWith("/settings"),
	});
}

const navLinkClass =
	"flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground";
const navLinkActive = { className: "!bg-sidebar-accent !text-foreground" };

function SettingsGroup({
	title,
	items,
}: {
	title: string;
	items: readonly (typeof SETTINGS_NAV)[number][];
}) {
	return (
		<div className="space-y-0.5">
			<p className="label-mono truncate px-2.5 pb-1.5">{title}</p>
			{items.map(({ to, label, icon: Icon }) => (
				<Link
					key={to}
					to={to}
					className={navLinkClass}
					activeProps={navLinkActive}
				>
					<Icon className="size-4" />
					{label}
				</Link>
			))}
		</div>
	);
}

function NavLinks() {
	const inSettings = useInSettings();
	const account = useActiveAccountName();
	if (inSettings) {
		return (
			<nav className="space-y-5">
				<Link to="/dashboard" className={navLinkClass}>
					<ArrowLeftIcon className="size-4" />
					Back to dashboard
				</Link>
				<SettingsGroup title="You" items={SETTINGS_YOU} />
				<SettingsGroup title={account} items={SETTINGS_ACCOUNT} />
			</nav>
		);
	}
	return (
		<nav className="space-y-0.5">
			{NAV.map(({ to, label, icon: Icon }) => (
				<Link
					key={to}
					to={to}
					className={navLinkClass}
					activeProps={navLinkActive}
				>
					<Icon className="size-4" />
					{label}
				</Link>
			))}
		</nav>
	);
}

/** "Switch account" items for a dropdown; nothing for people in one account. */
function AccountSwitchItems() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const accounts = useAccounts();
	const switchTo = useMutation(
		orpc.team.switch.mutationOptions({
			onSuccess: async () => {
				// Every query is scoped to the account, so start over.
				await queryClient.invalidateQueries();
				navigate({ to: "/dashboard" });
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const list = accounts.data?.accounts ?? [];
	const activeId = accounts.data?.active.accountId;
	if (list.length < 2) return null;
	return (
		<DropdownMenuGroup>
			<DropdownMenuLabel className="label-mono">
				Switch account
			</DropdownMenuLabel>
			{list.map((a) => (
				<DropdownMenuItem
					key={a.accountId}
					disabled={switchTo.isPending}
					onClick={() =>
						a.accountId !== activeId &&
						switchTo.mutate({ accountId: a.accountId })
					}
				>
					<CheckIcon className={cn(a.accountId !== activeId && "invisible")} />
					<span className="min-w-0 flex-1 truncate">{accountName(a)}</span>
					<span className="text-[11px] text-muted-foreground">{a.role}</span>
				</DropdownMenuItem>
			))}
			<DropdownMenuSeparator />
		</DropdownMenuGroup>
	);
}

function signOut(navigate: ReturnType<typeof useNavigate>) {
	authClient.signOut({
		fetchOptions: { onSuccess: () => navigate({ to: "/" }) },
	});
}

/** The phone menu: the sidebar's menus, the account switcher and sign-out. */
function MobileNav() {
	const navigate = useNavigate();
	const inSettings = useInSettings();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="ghost" size="icon-sm" aria-label="Menu" />}
			>
				<MenuIcon />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-52 bg-popover">
				{inSettings ? (
					<>
						<DropdownMenuItem render={<Link to="/dashboard" />}>
							<ArrowLeftIcon /> Back to dashboard
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{SETTINGS_NAV.map(({ to, label, icon: Icon }) => (
							<DropdownMenuItem key={to} render={<Link to={to} />}>
								<Icon /> {label}
							</DropdownMenuItem>
						))}
					</>
				) : (
					[...NAV, ...SECONDARY].map(({ to, label, icon: Icon }) => (
						<DropdownMenuItem key={to} render={<Link to={to} />}>
							<Icon /> {label}
						</DropdownMenuItem>
					))
				)}
				<DropdownMenuSeparator />
				<AccountSwitchItems />
				<DropdownMenuItem
					variant="destructive"
					onClick={() => signOut(navigate)}
				>
					<LogOutIcon /> Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function UserMenu() {
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const accounts = useAccounts();
	if (!session) return null;
	const list = accounts.data?.accounts ?? [];
	const activeId = accounts.data?.active.accountId;
	const inTeam = list.find((a) => a.accountId === activeId && !a.personal);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						className="h-auto w-full justify-start gap-2.5 px-2.5 py-2 text-left"
					/>
				}
			>
				<span className="flex size-6 shrink-0 items-center justify-center bg-foreground font-mono text-[11px] text-background uppercase">
					{session.user.name.slice(0, 1)}
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-[12.5px]">
						{session.user.name}
					</span>
					<span className="block truncate text-[11px] text-muted-foreground">
						{inTeam ? `in ${accountName(inTeam)}` : session.user.email}
					</span>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" className="w-60 bg-popover">
				<DropdownMenuGroup>
					<DropdownMenuLabel>{session.user.email}</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<AccountSwitchItems />
					<DropdownMenuItem render={<Link to="/settings" />}>
						<SettingsIcon /> Settings
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onClick={() => signOut(navigate)}
					>
						<LogOutIcon /> Sign out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function BalancePill() {
	const { data } = useOverview();
	const low = data && data.runwayHours !== null && data.runwayHours < 24;
	return (
		<Link
			to="/credits"
			className={cn(
				"tabular inline-flex h-8 items-center gap-2 border px-2.5 font-mono text-[12px] transition-colors hover:bg-muted",
				data &&
					data.balanceMicros <= 0 &&
					"border-destructive/50 text-destructive",
				low && "border-warn/50",
			)}
		>
			<span className="text-muted-foreground">balance</span>
			{data ? formatUsd(data.balanceMicros) : "—"}
		</Link>
	);
}

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-svh lg:grid lg:grid-cols-[232px_1fr]">
			<aside className="sticky top-0 hidden h-svh flex-col border-r bg-sidebar px-3 py-4 lg:flex">
				<div className="px-2.5 pb-6">
					<Logo to="/dashboard" />
				</div>
				<NavLinks />
				<div className="mt-auto space-y-3">
					<nav className="space-y-0.5">
						{SECONDARY.map(({ to, label, icon: Icon }) => (
							<Link
								key={to}
								to={to}
								className="flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"
								activeProps={{
									className: "!bg-sidebar-accent !text-foreground",
								}}
							>
								<Icon className="size-4" />
								{label}
							</Link>
						))}
					</nav>
					<div className="border-t pt-3">
						<UserMenu />
					</div>
				</div>
			</aside>

			<div className="min-w-0">
				<header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
					<div className="flex items-center gap-2 lg:hidden">
						<MobileNav />
						<Logo to="/dashboard" />
					</div>
					<div className="hidden lg:block" />
					<div className="flex items-center gap-2">
						<ThemeToggle />
						<BalancePill />
						<Link
							to="/servers/new"
							className={buttonVariants({ variant: "signal" })}
						>
							<PlusIcon /> <span className="hidden sm:inline">New server</span>
						</Link>
					</div>
				</header>
				<main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
					{children}
				</main>
			</div>
		</div>
	);
}

export function PageHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
			<div>
				<h1 className="font-medium text-2xl tracking-tight">{title}</h1>
				{description && (
					<p className="mt-1.5 max-w-2xl text-muted-foreground text-sm">
						{description}
					</p>
				)}
			</div>
			{actions && (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			)}
		</div>
	);
}

export function Panel({
	title,
	actions,
	children,
	className,
}: {
	title?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("border bg-card", className)}>
			{(title || actions) && (
				<div className="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2">
					<h2 className="label-mono">{title}</h2>
					{actions}
				</div>
			)}
			{children}
		</section>
	);
}

export function Stat({
	label,
	value,
	hint,
}: {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
}) {
	return (
		<div className="bg-card p-4">
			<p className="label-mono">{label}</p>
			<p className="tabular mt-2 font-medium text-2xl tracking-tight">
				{value}
			</p>
			{hint && <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>}
		</div>
	);
}
