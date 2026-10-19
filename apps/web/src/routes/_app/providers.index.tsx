import { Badge } from "@switchyard/ui/components/badge";
import { Button, buttonVariants } from "@switchyard/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightIcon, LockIcon } from "lucide-react";
import { useState } from "react";

import { PageHeader, Stat } from "@/components/app/app-shell";
import {
	ConnectProviderDialog,
	type ProviderTarget,
	useProviderAccounts,
} from "@/components/app/provider-account-dialogs";
import { ProviderLogo } from "@/components/provider-logo";
import { flag, formatUsd } from "@/lib/format";
import { site } from "@/lib/site";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/providers/")({
	head: () => ({ meta: [{ title: "Providers — HessianLabs" }] }),
	component: ProvidersPage,
});

type CatalogProvider = NonNullable<
	ReturnType<typeof useCatalogProviders>["data"]
>[number];
type Account = NonNullable<
	ReturnType<typeof useProviderAccounts>["data"]
>[number];

const useCatalogProviders = () =>
	useQuery(orpc.catalog.providers.queryOptions());

const tagline = (id: string) =>
	[...site.cloudProviders, ...site.gpuProviders].find((p) => p.id === id)
		?.tagline;

function ProvidersPage() {
	const meta = useQuery(orpc.meta.queryOptions());
	const providers = useCatalogProviders();
	const regions = useQuery(orpc.catalog.regions.queryOptions({ input: {} }));
	const accounts = useProviderAccounts();
	const [connecting, setConnecting] = useState<ProviderTarget | null>(null);

	const all = providers.data ?? [];
	const countries = (id: string) => [
		...new Set(
			(regions.data ?? [])
				.filter((r) => r.provider === id)
				.map((r) => r.country),
		),
	];
	const connected = (accounts.data ?? []).filter((a) => !a.error).length;
	const groups = [
		{
			title: "General clouds",
			items: all.filter((p) => p.category === "cloud"),
		},
		{ title: "GPU clouds", items: all.filter((p) => p.category === "gpu") },
	];

	return (
		<>
			<PageHeader
				title="Providers"
				description={`Every hosting provider HessianLabs supports. Connect your own account to launch servers there: the provider bills you directly, and HessianLabs charges ${
					meta.data ? `${meta.data.feePercent}%` : "a small share"
				} of a server's list price from your credits.`}
				actions={
					<Link to="/plans" className={buttonVariants({ variant: "outline" })}>
						Browse all plans <ArrowRightIcon />
					</Link>
				}
			/>

			{meta.data?.cloudMode === "sandbox" && (
				<p className="mb-6 border border-warn/40 bg-warn/10 px-4 py-3 font-mono text-[12px]">
					Sandbox mode: any token connects and servers are simulated. Nothing
					reaches a provider.
				</p>
			)}

			<div className="mb-10 grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
				<Stat
					label="Connected"
					value={accounts.isSuccess ? connected : "—"}
					hint={`of ${all.filter((p) => p.connectable).length} available today`}
				/>
				<Stat
					label="Providers"
					value={all.length || "—"}
					hint="In the catalog"
				/>
				<Stat
					label="Regions"
					value={all.reduce((n, p) => n + p.regions, 0) || "—"}
					hint={`${new Set((regions.data ?? []).map((r) => r.country)).size || "—"} countries`}
				/>
				<Stat
					label="Plans"
					value={all.reduce((n, p) => n + p.plans, 0) || "—"}
					hint="At list price"
				/>
			</div>

			{groups.map((group) => (
				<section key={group.title} className="mb-10">
					<h2 className="label-mono mb-3">
						{group.title}{" "}
						<span className="text-muted-foreground">
							· {group.items.length}
						</span>
					</h2>
					{/* Borders on the cards, not a gap fill, so a short last row stays clean. */}
					<div className="grid border-t border-l sm:grid-cols-2 xl:grid-cols-3">
						{group.items.map((p) => (
							<ProviderCard
								key={p.id}
								provider={p}
								account={accounts.byProvider.get(p.id)}
								countries={countries(p.id)}
								onConnect={() => setConnecting({ id: p.id, name: p.name })}
							/>
						))}
						{providers.isPending &&
							Array.from({ length: 3 }, (_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton cards
								<div
									key={i}
									className="h-52 animate-pulse border-r border-b bg-card"
								/>
							))}
					</div>
				</section>
			))}

			<p className="flex items-start gap-2 text-[12px] text-muted-foreground">
				<LockIcon className="mt-0.5 size-3.5 shrink-0" />
				Credentials are encrypted before they're stored and are never shown
				again. Use a token limited to servers, and revoke it at the provider
				whenever you like.
			</p>

			{connecting && (
				<ConnectProviderDialog
					target={connecting}
					onClose={() => setConnecting(null)}
				/>
			)}
		</>
	);
}

function ProviderCard({
	provider: p,
	account,
	countries,
	onConnect,
}: {
	provider: CatalogProvider;
	account?: Account;
	countries: string[];
	onConnect: () => void;
}) {
	return (
		<article className="flex flex-col border-r border-b bg-card">
			<Link
				to="/providers/$providerId"
				params={{ providerId: p.id }}
				className="group flex flex-1 items-start gap-3.5 p-4 transition-colors hover:bg-muted/40"
			>
				<ProviderLogo provider={p.id} className="size-11" />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="font-medium text-[14.5px] tracking-tight">
							{p.name}
						</h3>
						{account && !account.error && <Badge variant="go">connected</Badge>}
						{account?.error && <Badge variant="warn">needs attention</Badge>}
						{!p.connectable && <Badge>coming soon</Badge>}
					</div>
					<p className="mt-1 text-[12.5px] text-muted-foreground leading-snug">
						{tagline(p.id)}
					</p>
				</div>
				<ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
			</Link>
			<dl className="grid grid-cols-3 divide-x border-t">
				{(
					[
						["Plans", p.plans],
						["Regions", p.regions],
						[
							"From",
							p.fromHourlyMicros
								? `${formatUsd(p.fromHourlyMicros, { precise: true })}/h`
								: "—",
						],
					] as const
				).map(([label, value]) => (
					<div key={label} className="px-4 py-2.5">
						<dt className="label-mono">{label}</dt>
						<dd className="tabular mt-0.5 font-mono text-[13px]">{value}</dd>
					</div>
				))}
			</dl>
			<div className="flex min-h-12 items-center justify-between gap-3 border-t px-4 py-2">
				<span className="truncate text-[13px]" title={countries.join(", ")}>
					{countries.slice(0, 7).map(flag).join(" ")}
					{countries.length > 7 && (
						<span className="ml-1 font-mono text-[10.5px] text-muted-foreground">
							+{countries.length - 7}
						</span>
					)}
				</span>
				{account && !account.error ? (
					<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
						…{account.hint} · {account.activeServers} running
					</span>
				) : p.connectable ? (
					<Button size="xs" variant="outline" onClick={onConnect}>
						{account?.error ? "Fix token" : "Connect"}
					</Button>
				) : (
					<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
						soon
					</span>
				)}
			</div>
		</article>
	);
}
