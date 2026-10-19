import { buttonVariants } from "@switchyard/ui/components/button";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import {
	CatalogFilters,
	catalogSearchSchema,
	toFilters,
} from "@/components/catalog/filters";
import { PlanTable } from "@/components/catalog/plan-table";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { orpc } from "@/utils/orpc";

const plansQuery = (search: Parameters<typeof toFilters>[0]) =>
	orpc.catalog.plans.queryOptions({
		input: {
			filters: toFilters(search),
			sort: search.sort ?? "price",
			limit: 500,
		},
		placeholderData: keepPreviousData,
	});

export const Route = createFileRoute("/catalog")({
	validateSearch: catalogSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.prefetchQuery(plansQuery(deps)),
	head: () => ({
		meta: [
			{ title: "Server catalog — Switchyard" },
			{
				name: "description",
				content:
					"Compare VPS and GPU plans from 17 clouds — Hetzner, DigitalOcean, Vultr, RunPod, Lambda and more — in one table.",
			},
		],
	}),
	component: CatalogPage,
});

function CatalogPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const plans = useQuery(plansQuery(search));
	const providers = useQuery(orpc.catalog.providers.queryOptions());
	const sandbox = providers.data?.some((p) => p.mode === "sandbox");

	return (
		<div className="flex min-h-svh flex-col">
			<SiteHeader />
			<main className="mx-auto w-full max-w-6xl flex-1 px-5 py-14">
				<p className="label-mono">Catalog</p>
				<div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
					<div>
						<h1 className="font-medium text-3xl tracking-tight sm:text-4xl">
							Every plan, one table.
						</h1>
						<p className="mt-3 max-w-xl text-muted-foreground text-sm">
							The same catalog your agent searches with{" "}
							<code className="font-mono text-[12px]">search_plans</code>.
							Prices are per provider list price, in USD, billed per minute.
						</p>
					</div>
					{providers.data && (
						<div className="flex gap-6 font-mono text-[11px] text-muted-foreground">
							<span>
								<span className="text-foreground">{providers.data.length}</span>{" "}
								providers
							</span>
							<span>
								<span className="text-foreground">
									{providers.data.reduce((n, p) => n + p.regions, 0)}
								</span>{" "}
								regions
							</span>
							<span>
								<span className="text-foreground">
									{providers.data.reduce((n, p) => n + p.plans, 0)}
								</span>{" "}
								plans
							</span>
						</div>
					)}
				</div>
				{sandbox && (
					<p className="mt-6 border border-warn/40 bg-warn/10 px-3 py-2 font-mono text-[11px]">
						Providers marked <span className="text-signal">°</span> / preview
						are simulated with indicative prices, as are any providers without
						platform API credentials configured.
					</p>
				)}
				<CatalogFilters
					className="mt-8 border-y py-4"
					value={search}
					total={plans.data?.total}
					onChange={(next) =>
						navigate({ search: next, replace: true, resetScroll: false })
					}
				/>
				<div className="mt-2">
					<PlanTable
						plans={plans.data?.plans ?? []}
						loading={plans.isPending}
						action={(p) => (
							<Link
								to="/servers/new"
								search={{ planId: p.id }}
								className={buttonVariants({ variant: "ghost", size: "xs" })}
							>
								Deploy →
							</Link>
						)}
					/>
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}
