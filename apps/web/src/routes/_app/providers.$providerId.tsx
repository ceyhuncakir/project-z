import { Badge } from "@switchyard/ui/components/badge";
import { Button, buttonVariants } from "@switchyard/ui/components/button";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ExternalLinkIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Panel, Stat } from "@/components/app/app-shell";
import {
	ConnectProviderDialog,
	DisconnectProviderDialog,
	useProviderAccounts,
} from "@/components/app/provider-account-dialogs";
import { CONTINENT_OPTIONS } from "@/components/catalog/filters";
import { PlanTable } from "@/components/catalog/plan-table";
import { ProviderLogo } from "@/components/provider-logo";
import { flag, formatUsd, timeAgo } from "@/lib/format";
import { PROVIDER_SETUP } from "@/lib/provider-setup";
import { site } from "@/lib/site";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/providers/$providerId")({
	head: () => ({ meta: [{ title: "Provider — HessianLabs" }] }),
	component: ProviderPage,
});

function ProviderPage() {
	const { providerId } = Route.useParams();
	const providers = useQuery(orpc.catalog.providers.queryOptions());
	const regions = useQuery(
		orpc.catalog.regions.queryOptions({
			input: { providers: [providerId as never] },
		}),
	);
	const plans = useQuery(
		orpc.catalog.plans.queryOptions({
			input: {
				filters: { providers: [providerId as never], kind: "any" },
				sort: "price",
				limit: 500,
			},
			placeholderData: keepPreviousData,
		}),
	);
	const accounts = useProviderAccounts();
	const [dialog, setDialog] = useState<"connect" | "disconnect" | null>(null);

	const p = providers.data?.find((x) => x.id === providerId);
	if (providers.isSuccess && !p) {
		return (
			<div className="py-16 text-center">
				<p className="text-muted-foreground">Unknown provider.</p>
				<Link
					to="/providers"
					className="mt-4 inline-block underline underline-offset-4"
				>
					All providers
				</Link>
			</div>
		);
	}
	if (!p) return <div className="h-64 animate-pulse border bg-card" />;

	const account = accounts.byProvider.get(p.id);
	const live = Boolean(account && !account.error);
	const setup = PROVIDER_SETUP[p.id];
	const target = { id: p.id, name: p.name };
	const tagline = [...site.cloudProviders, ...site.gpuProviders].find(
		(x) => x.id === p.id,
	)?.tagline;
	const byContinent = CONTINENT_OPTIONS.map(([id, label]) => ({
		label,
		regions: (regions.data ?? []).filter((r) => r.continent === id),
	})).filter((g) => g.regions.length);

	return (
		<>
			<Link
				to="/providers"
				className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
			>
				<ArrowLeftIcon className="size-3.5" /> Providers
			</Link>

			<div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
				<div className="flex items-center gap-4">
					<ProviderLogo provider={p.id} className="size-14" />
					<div>
						<div className="flex flex-wrap items-center gap-2.5">
							<h1 className="font-medium text-2xl tracking-tight">{p.name}</h1>
							{live && <Badge variant="go">connected</Badge>}
							{account?.error && <Badge variant="warn">needs attention</Badge>}
							{!p.connectable && <Badge>coming soon</Badge>}
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							{tagline}{" "}
							<a
								href={p.website}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 whitespace-nowrap text-foreground underline-offset-4 hover:underline"
							>
								{new URL(p.website).hostname.replace(/^www\./, "")}
								<ExternalLinkIcon className="size-3" />
							</a>
						</p>
					</div>
				</div>
				<div className="flex shrink-0 flex-wrap gap-2">
					{account && (
						<Button
							variant="ghost"
							className="text-destructive"
							onClick={() => setDialog("disconnect")}
						>
							Disconnect
						</Button>
					)}
					{p.connectable && (account || !setup) && (
						<Button
							variant={live ? "outline" : "signal"}
							onClick={() => setDialog("connect")}
						>
							{account ? "Replace token" : `Connect ${p.name}`}
						</Button>
					)}
					{live && (
						<Link
							to="/servers/new"
							className={buttonVariants({ variant: "signal" })}
						>
							<PlusIcon /> New server
						</Link>
					)}
				</div>
			</div>

			{account?.error && (
				<p className="mb-6 border border-warn/40 bg-warn/10 px-4 py-3 text-[13px]">
					{account.error}. Replace the token to launch servers here again.
				</p>
			)}

			<div className="mb-6 grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
				<Stat label="Plans" value={p.plans} />
				<Stat
					label="Regions"
					value={p.regions}
					hint={`${new Set((regions.data ?? []).map((r) => r.country)).size} countries`}
				/>
				<Stat
					label="From"
					value={
						p.fromHourlyMicros
							? `${formatUsd(p.fromHourlyMicros, { precise: true })}/h`
							: "—"
					}
					hint="List price, billed by the provider"
				/>
				<Stat
					label="Your account"
					value={live ? `…${account?.hint}` : p.connectable ? "—" : "Soon"}
					hint={
						live && account
							? `${account.activeServers} running · checked ${timeAgo(account.verifiedAt ?? account.createdAt)}`
							: p.connectable
								? "Not connected"
								: "Can't be connected yet"
					}
				/>
			</div>

			{!account && p.connectable && setup && (
				<Panel title="Connect your account" className="mb-6">
					<div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
						<ol className="flex-1 list-decimal space-y-1.5 pl-5 text-[13px] text-muted-foreground">
							{setup.steps.map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
						<Button variant="signal" onClick={() => setDialog("connect")}>
							Connect {p.name}
						</Button>
					</div>
				</Panel>
			)}

			<Panel title="Regions" className="mb-6">
				<div className="flex flex-col divide-y sm:flex-row sm:divide-x sm:divide-y-0">
					{byContinent.map((g) => (
						<div key={g.label} className="flex-1 px-4 py-3">
							<p className="label-mono mb-2">{g.label}</p>
							<ul className="space-y-1.5">
								{g.regions.map((r) => (
									<li
										key={r.id}
										className="flex items-center justify-between gap-3 text-[13px]"
									>
										<span>
											{flag(r.country)} {r.city}
										</span>
										<span className="font-mono text-[10.5px] text-muted-foreground">
											{r.slug}
										</span>
									</li>
								))}
							</ul>
						</div>
					))}
					{regions.isPending && <div className="h-24 flex-1 animate-pulse" />}
				</div>
			</Panel>

			<Panel
				title={
					<>
						Plans{" "}
						<span className="text-muted-foreground">
							· {plans.data?.total ?? "…"}
						</span>
					</>
				}
			>
				<PlanTable
					plans={plans.data?.plans ?? []}
					loading={plans.isPending}
					hideProvider
					action={(plan) =>
						live ? (
							<Link
								to="/servers/new"
								search={{ planId: plan.id }}
								className={buttonVariants({ variant: "ghost", size: "xs" })}
							>
								Launch →
							</Link>
						) : null
					}
				/>
			</Panel>

			{dialog === "connect" && (
				<ConnectProviderDialog
					target={target}
					onClose={() => setDialog(null)}
				/>
			)}
			{dialog === "disconnect" && account && (
				<DisconnectProviderDialog
					target={target}
					account={account}
					onClose={() => setDialog(null)}
				/>
			)}
		</>
	);
}
