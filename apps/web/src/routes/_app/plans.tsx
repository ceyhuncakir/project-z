import { buttonVariants } from "@switchyard/ui/components/button";
import { Checkbox } from "@switchyard/ui/components/checkbox";
import { Label } from "@switchyard/ui/components/label";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { z } from "zod";

import { PageHeader, Panel } from "@/components/app/app-shell";
import { useProviderAccounts } from "@/components/app/provider-account-dialogs";
import {
	CatalogFilters,
	catalogSearchSchema,
	toFilters,
} from "@/components/catalog/filters";
import { PlanTable } from "@/components/catalog/plan-table";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/plans")({
	validateSearch: catalogSearchSchema.extend({
		/** Only plans on the user's connected accounts. */
		mine: z.coerce.boolean().optional(),
	}),
	head: () => ({ meta: [{ title: "Catalog — HessianLabs" }] }),
	component: CatalogPage,
});

function CatalogPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const providers = useQuery(orpc.catalog.providers.queryOptions());
	const accounts = useProviderAccounts();
	const connected = (accounts.data ?? [])
		.filter((a) => !a.error)
		.map((a) => a.provider as string);

	const { mine, ...filters } = search;
	// "Mine" narrows the provider filter to connected accounts.
	const wanted = mine
		? connected.filter(
				(p) => !filters.providers?.length || filters.providers.includes(p),
			)
		: filters.providers;
	const nothing = mine && accounts.isSuccess && !wanted?.length;
	const plans = useQuery(
		orpc.catalog.plans.queryOptions({
			input: {
				filters: { ...toFilters(filters), providers: wanted as never[] },
				sort: filters.sort ?? "price",
				limit: 500,
			},
			enabled: !nothing,
			placeholderData: keepPreviousData,
		}),
	);
	const preview = new Set(
		(providers.data ?? []).filter((p) => !p.connectable).map((p) => p.id),
	);

	return (
		<>
			<PageHeader
				title="Catalog"
				description="Every plan from every provider, at list price. Plans on your connected accounts launch straight away; for the others, connect the account first."
				actions={
					<Link
						to="/providers"
						className={buttonVariants({ variant: "outline" })}
					>
						All providers <ArrowRightIcon />
					</Link>
				}
			/>
			<Panel>
				<div className="border-b p-4">
					<CatalogFilters
						value={filters}
						total={nothing ? 0 : plans.data?.total}
						onChange={(next) =>
							navigate({
								search: { ...next, mine },
								replace: true,
								resetScroll: false,
							})
						}
					/>
					<Label className="mt-3 text-[12.5px]">
						<Checkbox
							checked={Boolean(mine)}
							onCheckedChange={(on) =>
								navigate({
									search: { ...filters, mine: on ? true : undefined },
									replace: true,
									resetScroll: false,
								})
							}
						/>
						Only my connected accounts
						<span className="font-mono text-[11px] text-muted-foreground">
							({connected.length})
						</span>
					</Label>
				</div>
				<PlanTable
					plans={nothing ? [] : (plans.data?.plans ?? [])}
					loading={!nothing && plans.isPending}
					action={(p) =>
						connected.includes(p.provider) ? (
							<Link
								to="/servers/new"
								search={{ planId: p.id }}
								className={buttonVariants({ variant: "ghost", size: "xs" })}
							>
								Launch →
							</Link>
						) : preview.has(p.provider) ? (
							<span className="px-2 font-mono text-[11px] text-muted-foreground">
								soon
							</span>
						) : (
							<Link
								to="/providers/$providerId"
								params={{ providerId: p.provider }}
								className={buttonVariants({ variant: "ghost", size: "xs" })}
							>
								Connect
							</Link>
						)
					}
				/>
			</Panel>
		</>
	);
}
