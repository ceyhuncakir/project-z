import { Badge } from "@switchyard/ui/components/badge";
import { Button } from "@switchyard/ui/components/button";
import { Input } from "@switchyard/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@switchyard/ui/components/table";
import { cn } from "@switchyard/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon, FlaskConicalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
	PageHeader,
	Panel,
	Stat,
	useOverview,
} from "@/components/app/app-shell";
import { formatRunway, formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/credits")({
	validateSearch: z.object({ checkout_id: z.string().optional() }),
	head: () => ({ meta: [{ title: "Credits — Switchyard" }] }),
	component: CreditsPage,
});

const PRESETS = [10, 25, 50, 100];

const KIND_VARIANT = {
	topup: "go",
	promo: "go",
	refund: "go",
	adjustment: "default",
	usage: "default",
} as const;

function CreditsPage() {
	const { checkout_id } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();
	const [amount, setAmount] = useState(25);
	const meta = useQuery(orpc.meta.queryOptions());
	const overview = useOverview();
	const txns = useQuery(
		orpc.credits.transactions.queryOptions({
			input: { limit: 100 },
			refetchInterval: 30_000,
		}),
	);

	useEffect(() => {
		if (!checkout_id) return;
		toast.success(
			"Payment received — your credits will appear in a few seconds.",
		);
		const t = setInterval(() => queryClient.invalidateQueries(), 2_000);
		const stop = setTimeout(() => clearInterval(t), 20_000);
		navigate({ search: {}, replace: true });
		return () => {
			clearInterval(t);
			clearTimeout(stop);
		};
	}, [checkout_id, navigate, queryClient]);

	const topup = meta.data?.topup;
	const fee = topup
		? Math.max((amount * topup.feePercent) / 100, topup.feeMinMicros / 1e6)
		: 0;
	const feeCents = Math.ceil(fee * 100 - 1e-9) / 100;
	const valid = topup
		? amount >= topup.minUsd && amount <= topup.maxUsd
		: false;

	const checkout = useMutation(
		orpc.credits.checkout.mutationOptions({
			onSuccess: ({ url }) => {
				window.location.href = url;
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const portal = useMutation(
		orpc.credits.portal.mutationOptions({
			onSuccess: ({ url }) => window.open(url, "_blank", "noopener"),
			onError: (e) => toast.error(e.message),
		}),
	);
	const testCredits = useMutation(
		orpc.credits.addTestCredits.mutationOptions({
			onSuccess: () => {
				toast.success(`Added ${formatUsd(amount * 1e6)} in test credits`);
				queryClient.invalidateQueries();
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const o = overview.data;
	return (
		<>
			<PageHeader
				title="Credits"
				description="One prepaid balance for every provider. Usage is charged per minute at provider list prices."
				actions={
					meta.data?.paymentsEnabled && (
						<Button
							variant="outline"
							onClick={() => portal.mutate({})}
							disabled={portal.isPending}
						>
							Receipts <ExternalLinkIcon />
						</Button>
					)
				}
			/>
			<div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
				<div className="min-w-0 space-y-6">
					<div className="grid grid-cols-1 gap-px border bg-border sm:grid-cols-3">
						<Stat
							label="Balance"
							value={o ? formatUsd(o.balanceMicros) : "—"}
						/>
						<Stat
							label="Burn rate"
							value={
								o
									? `${formatUsd(o.burnMicrosPerHour, { precise: true })}/h`
									: "—"
							}
						/>
						<Stat
							label="Runway"
							value={o ? formatRunway(o.runwayHours) : "—"}
						/>
					</div>
					<Panel title="History">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead>Date</TableHead>
									<TableHead>Description</TableHead>
									<TableHead>Type</TableHead>
									<TableHead className="text-right">Amount</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{txns.data?.map((t) => (
									<TableRow key={t.id}>
										<TableCell className="text-muted-foreground">
											{new Date(t.periodStart ?? t.createdAt).toLocaleString(
												undefined,
												{
													dateStyle: "medium",
													timeStyle: "short",
												},
											)}
										</TableCell>
										<TableCell className="max-w-[18rem] truncate">
											{t.description}
										</TableCell>
										<TableCell>
											<Badge variant={KIND_VARIANT[t.kind]}>{t.kind}</Badge>
										</TableCell>
										<TableCell
											className={cn(
												"tabular text-right font-mono",
												t.amountMicros > 0 ? "text-go" : "text-foreground",
											)}
										>
											{t.amountMicros > 0 ? "+" : ""}
											{formatUsd(t.amountMicros, {
												precise: t.kind === "usage",
											})}
										</TableCell>
									</TableRow>
								))}
								{txns.data?.length === 0 && (
									<TableRow className="hover:bg-transparent">
										<TableCell
											colSpan={4}
											className="py-10 text-center text-muted-foreground text-sm"
										>
											No transactions yet.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</Panel>
				</div>

				<Panel title="Add credits" className="lg:sticky lg:top-20">
					<div className="space-y-4 p-4">
						<div className="grid grid-cols-4 gap-px border bg-border">
							{PRESETS.map((p) => (
								<button
									key={p}
									type="button"
									onClick={() => setAmount(p)}
									className={cn(
										"bg-card py-3 font-mono text-[13px] transition-colors hover:bg-muted/50",
										amount === p &&
											"bg-foreground text-background hover:bg-foreground",
									)}
								>
									${p}
								</button>
							))}
						</div>
						<div className="relative">
							<span className="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-muted-foreground text-sm">
								$
							</span>
							<Input
								type="number"
								min={topup?.minUsd}
								max={topup?.maxUsd}
								value={amount}
								onChange={(e) => setAmount(Number(e.target.value))}
								className="h-10 pl-7 font-mono text-sm"
								aria-label="Amount in USD"
							/>
						</div>
						<dl className="space-y-2 font-mono text-[12.5px]">
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Credits</dt>
								<dd className="tabular">{formatUsd(amount * 1e6)}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">
									Fee ({topup?.feePercent ?? 5}%, min $0.50)
								</dt>
								<dd className="tabular">{formatUsd(feeCents * 1e6)}</dd>
							</div>
							<div className="flex justify-between border-t pt-2 text-foreground">
								<dt>Total</dt>
								<dd className="tabular">
									{formatUsd((amount + feeCents) * 1e6)}
								</dd>
							</div>
						</dl>
						{meta.data?.paymentsEnabled ? (
							<Button
								variant="signal"
								size="xl"
								className="w-full"
								disabled={!valid || checkout.isPending}
								onClick={() => checkout.mutate({ amountUsd: amount })}
							>
								{checkout.isPending
									? "Opening checkout…"
									: "Continue to payment"}
							</Button>
						) : (
							<p className="border px-3 py-2 text-[12px] text-muted-foreground">
								Card payments aren't configured on this deployment. Set the
								Polar environment variables to enable checkout.
							</p>
						)}
						{meta.data?.testCreditsEnabled && (
							<Button
								variant="outline"
								className="w-full"
								disabled={amount <= 0 || amount > 100 || testCredits.isPending}
								onClick={() => testCredits.mutate({ amountUsd: amount })}
							>
								<FlaskConicalIcon /> Add{" "}
								{formatUsd(Math.min(amount, 100) * 1e6)} test credits
							</Button>
						)}
						{topup && (
							<p className="text-[11.5px] text-muted-foreground">
								Between ${topup.minUsd} and ${topup.maxUsd.toLocaleString()} per
								top-up. Payments are processed by Polar.
							</p>
						)}
					</div>
				</Panel>
			</div>
		</>
	);
}
