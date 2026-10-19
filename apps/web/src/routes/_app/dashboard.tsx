import { buttonVariants } from "@switchyard/ui/components/button";
import { cn } from "@switchyard/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRightIcon, CheckIcon } from "lucide-react";

import { ActivityList } from "@/components/app/activity-list";
import {
	PageHeader,
	Panel,
	Stat,
	useOverview,
} from "@/components/app/app-shell";
import { ServerTable } from "@/components/app/server-table";
import { formatRunway, formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/dashboard")({
	head: () => ({ meta: [{ title: "Overview — HessianLabs" }] }),
	component: Overview,
});

function Overview() {
	const { session } = Route.useRouteContext();
	const overview = useOverview();
	const servers = useQuery(
		orpc.servers.list.queryOptions({ input: {}, refetchInterval: 10_000 }),
	);
	const keys = useQuery(orpc.apiKeys.list.queryOptions());
	const activity = useQuery(
		orpc.activity.list.queryOptions({ input: { limit: 8 } }),
	);

	const o = overview.data;
	const steps = [
		{
			done: (o?.connectedAccounts ?? 0) > 0,
			label: "Connect a cloud account",
			to: "/providers",
		},
		{ done: (o?.balanceMicros ?? 0) > 0, label: "Add credits", to: "/credits" },
		{
			done: (keys.data?.length ?? 0) > 0,
			label: "Create an API key",
			to: "/keys",
		},
		{
			done: (activity.data ?? []).some(
				(a) => a.actor === "mcp" || a.actor === "api",
			),
			label: "Let your agent launch a server",
			to: "/docs",
		},
	] as const;
	const onboarding =
		overview.isSuccess && keys.isSuccess && steps.some((s) => !s.done);

	return (
		<>
			<PageHeader
				title={`Hello, ${session.user.name.split(" ")[0]}`}
				description="Your balance, what's running, and what your agents have been up to."
			/>

			{onboarding && (
				<Panel title="Get set up" className="mb-6">
					<ol className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
						{steps.map((s, i) => (
							<li key={s.label} className="bg-card">
								<Link
									to={s.to}
									className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
								>
									<span
										className={cn(
											"flex size-6 shrink-0 items-center justify-center border font-mono text-[11px]",
											s.done && "border-go bg-go text-background",
										)}
									>
										{s.done ? <CheckIcon className="size-3.5" /> : i + 1}
									</span>
									<span
										className={cn(
											"text-[13px]",
											s.done && "text-muted-foreground line-through",
										)}
									>
										{s.label}
									</span>
									{!s.done && (
										<ArrowRightIcon className="ml-auto size-3.5 text-muted-foreground" />
									)}
								</Link>
							</li>
						))}
					</ol>
				</Panel>
			)}

			<div className="grid grid-cols-2 gap-px border bg-border lg:grid-cols-4">
				<Stat
					label="Balance"
					value={o ? formatUsd(o.balanceMicros) : "—"}
					hint={
						<Link to="/credits" className="hover:text-foreground">
							Add credits →
						</Link>
					}
				/>
				<Stat
					label="HessianLabs fee"
					value={
						o ? `${formatUsd(o.burnMicrosPerHour, { precise: true })}/h` : "—"
					}
					hint={
						o
							? `Servers: ${formatUsd(o.serverSpendMicrosPerHour, { precise: true })}/h, billed by your providers`
							: undefined
					}
				/>
				<Stat
					label="Runway"
					value={o ? formatRunway(o.runwayHours) : "—"}
					hint={
						o?.runwayHours === null
							? "No fees accruing"
							: "Until credits run out; then no new servers"
					}
				/>
				<Stat
					label="Active servers"
					value={o?.activeServers ?? "—"}
					hint={
						o ? `On ${o.connectedAccounts} connected account(s)` : undefined
					}
				/>
			</div>

			<div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
				<Panel
					title="Servers"
					actions={
						<Link
							to="/servers"
							className={buttonVariants({ variant: "ghost", size: "xs" })}
						>
							View all
						</Link>
					}
				>
					{servers.data?.length ? (
						<ServerTable servers={servers.data.slice(0, 6)} compact />
					) : (
						<div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
							<p className="text-muted-foreground text-sm">
								No servers running.
							</p>
							<Link
								to="/servers/new"
								className={buttonVariants({ variant: "outline", size: "sm" })}
							>
								Launch one
							</Link>
						</div>
					)}
				</Panel>
				<Panel
					title="Recent activity"
					actions={
						<Link
							to="/activity"
							className={buttonVariants({ variant: "ghost", size: "xs" })}
						>
							View all
						</Link>
					}
				>
					<ActivityList
						items={activity.data ?? []}
						empty="Agent and dashboard actions show up here."
					/>
				</Panel>
			</div>
		</>
	);
}
