import { Badge } from "@switchyard/ui/components/badge";
import { Button } from "@switchyard/ui/components/button";
import { Checkbox } from "@switchyard/ui/components/checkbox";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
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
import {
	CreditCardIcon,
	ExternalLinkIcon,
	FlaskConicalIcon,
	RefreshCwIcon,
} from "lucide-react";
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
	validateSearch: z.object({
		session_id: z.string().optional(),
		canceled: z.coerce.boolean().optional(),
	}),
	head: () => ({ meta: [{ title: "Credits — HessianLabs" }] }),
	component: CreditsPage,
});

const PRESETS = [10, 25, 50, 100];

const KIND_VARIANT = {
	topup: "go",
	promo: "go",
	refund: "warn",
	adjustment: "default",
	usage: "default",
} as const;

function useFeeQuote(amount: number) {
	const meta = useQuery(orpc.meta.queryOptions());
	const topup = meta.data?.topup;
	const fee = topup
		? Math.max((amount * topup.feePercent) / 100, topup.feeMinMicros / 1e6)
		: 0;
	const feeUsd = Math.ceil(fee * 100 - 1e-9) / 100;
	return {
		meta: meta.data,
		feeUsd,
		valid: topup ? amount >= topup.minUsd && amount <= topup.maxUsd : false,
	};
}

function CreditsPage() {
	const { session_id, canceled } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const queryClient = useQueryClient();
	const overview = useOverview();
	const billing = useQuery(orpc.credits.billing.queryOptions());
	const txns = useQuery(
		orpc.credits.transactions.queryOptions({
			input: { limit: 100 },
			refetchInterval: 30_000,
		}),
	);

	// Returning from Stripe Checkout: the webhook credits the wallet within seconds.
	useEffect(() => {
		if (!session_id && !canceled) return;
		if (session_id)
			toast.success(
				"Payment received — your credits will appear in a few seconds.",
			);
		else toast("Checkout canceled — you weren't charged.");
		navigate({ search: {}, replace: true });
		if (!session_id) return;
		const t = setInterval(() => queryClient.invalidateQueries(), 2_000);
		const stop = setTimeout(() => clearInterval(t), 20_000);
		return () => {
			clearInterval(t);
			clearTimeout(stop);
		};
	}, [session_id, canceled, navigate, queryClient]);

	const portal = useMutation(
		orpc.credits.portal.mutationOptions({
			onSuccess: ({ url }) => window.open(url, "_blank", "noopener"),
			onError: (e) => toast.error(e.message),
		}),
	);

	const o = overview.data;
	return (
		<>
			<PageHeader
				title="Credits"
				description="Credits pay HessianLabs's fee, charged per minute while your servers run. Your providers bill the servers themselves to your own accounts."
				actions={
					billing.data?.paymentsEnabled && (
						<Button
							variant="outline"
							onClick={() => portal.mutate({})}
							disabled={portal.isPending}
						>
							Receipts & invoices <ExternalLinkIcon />
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
							label="Fee rate"
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
					{billing.data?.paymentsEnabled && <AutoTopupPanel />}
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
				<TopupPanel hasCard={Boolean(billing.data?.card)} />
			</div>
		</>
	);
}

function TopupPanel({ hasCard }: { hasCard: boolean }) {
	const queryClient = useQueryClient();
	const [amount, setAmount] = useState(25);
	const [saveCard, setSaveCard] = useState(true);
	const { meta, feeUsd, valid } = useFeeQuote(amount);

	const checkout = useMutation(
		orpc.credits.checkout.mutationOptions({
			onSuccess: ({ url }) => {
				window.location.href = url;
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const testCredits = useMutation(
		orpc.credits.addTestCredits.mutationOptions({
			onSuccess: () => {
				toast.success(
					`Added ${formatUsd(Math.min(amount, 100) * 1e6)} in test credits`,
				);
				queryClient.invalidateQueries();
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	return (
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
						min={meta?.topup.minUsd}
						max={meta?.topup.maxUsd}
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
							Fee ({meta?.topup.feePercent ?? 5}%, min $0.50)
						</dt>
						<dd className="tabular">{formatUsd(feeUsd * 1e6)}</dd>
					</div>
					<div className="flex justify-between border-t pt-2 text-foreground">
						<dt>Total</dt>
						<dd className="tabular">{formatUsd((amount + feeUsd) * 1e6)}</dd>
					</div>
				</dl>
				{meta?.paymentsEnabled ? (
					<>
						{!hasCard && (
							<Label className="text-[12.5px] text-muted-foreground">
								<Checkbox
									checked={saveCard}
									onCheckedChange={(v) => setSaveCard(Boolean(v))}
								/>
								Save card for auto top-ups
							</Label>
						)}
						<Button
							variant="signal"
							size="xl"
							className="w-full"
							disabled={!valid || checkout.isPending}
							onClick={() =>
								checkout.mutate({
									amountUsd: amount,
									saveCard: !hasCard && saveCard,
								})
							}
						>
							<CreditCardIcon />
							{checkout.isPending ? "Opening Stripe…" : "Pay with card"}
						</Button>
					</>
				) : (
					<p className="border px-3 py-2 text-[12px] text-muted-foreground">
						Card payments aren't configured on this deployment. Set
						STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable Stripe
						Checkout.
					</p>
				)}
				{meta?.testCreditsEnabled && (
					<Button
						variant="outline"
						className="w-full"
						disabled={amount <= 0 || amount > 100 || testCredits.isPending}
						onClick={() => testCredits.mutate({ amountUsd: amount })}
					>
						<FlaskConicalIcon /> Add {formatUsd(Math.min(amount, 100) * 1e6)}{" "}
						test credits
					</Button>
				)}
				{meta && (
					<p className="text-[11.5px] text-muted-foreground">
						Between ${meta.topup.minUsd} and $
						{meta.topup.maxUsd.toLocaleString()} per top-up. Payments are
						processed securely by Stripe.
					</p>
				)}
			</div>
		</Panel>
	);
}

function AutoTopupPanel() {
	const queryClient = useQueryClient();
	const billing = useQuery(orpc.credits.billing.queryOptions());
	const settings = billing.data?.autoTopup;
	const [enabled, setEnabled] = useState(false);
	const [threshold, setThreshold] = useState(5);
	const [amount, setAmount] = useState(25);

	useEffect(() => {
		if (!settings) return;
		setEnabled(settings.enabled);
		setThreshold(settings.thresholdMicros / 1e6);
		setAmount(settings.amountMicros / 1e6);
	}, [settings]);

	const onDone = (message: string) => () => {
		toast.success(message);
		queryClient.invalidateQueries();
	};
	const save = useMutation(
		orpc.credits.updateAutoTopup.mutationOptions({
			onSuccess: onDone("Auto top-up saved"),
			onError: (e) => toast.error(e.message),
		}),
	);
	const remove = useMutation(
		orpc.credits.removeCard.mutationOptions({
			onSuccess: onDone("Card removed"),
			onError: (e) => toast.error(e.message),
		}),
	);

	const card = billing.data?.card;
	return (
		<Panel
			title="Auto top-up"
			actions={
				card && (
					<span className="inline-flex items-center gap-2 font-mono text-[11.5px]">
						<CreditCardIcon className="size-3.5 text-muted-foreground" />
						<span className="capitalize">{card.brand}</span> •••• {card.last4}
						<Button
							variant="ghost"
							size="xs"
							className="text-destructive"
							disabled={remove.isPending}
							onClick={() => remove.mutate({})}
						>
							Remove
						</Button>
					</span>
				)
			}
		>
			<div className="space-y-4 p-4">
				{settings?.error && (
					<p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px]">
						Last auto top-up failed and was turned off: {settings.error}
					</p>
				)}
				{!card ? (
					<p className="text-muted-foreground text-sm">
						Keep agents running without babysitting the balance: tick{" "}
						<span className="text-foreground">Save card for auto top-ups</span>{" "}
						on your next payment, then set a threshold here.
					</p>
				) : (
					<form
						className="flex flex-wrap items-end gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							save.mutate({
								enabled,
								thresholdUsd: threshold,
								amountUsd: amount,
							});
						}}
					>
						<Label className="h-9 text-[13px]">
							<Checkbox
								checked={enabled}
								onCheckedChange={(v) => setEnabled(Boolean(v))}
							/>
							Enabled
						</Label>
						<div className="space-y-1.5">
							<Label
								htmlFor="at-threshold"
								className="text-[12px] text-muted-foreground"
							>
								When balance drops below
							</Label>
							<Input
								id="at-threshold"
								type="number"
								min={0}
								className="w-32 font-mono"
								value={threshold}
								onChange={(e) => setThreshold(Number(e.target.value))}
							/>
						</div>
						<div className="space-y-1.5">
							<Label
								htmlFor="at-amount"
								className="text-[12px] text-muted-foreground"
							>
								Add credits of
							</Label>
							<Input
								id="at-amount"
								type="number"
								min={5}
								className="w-32 font-mono"
								value={amount}
								onChange={(e) => setAmount(Number(e.target.value))}
							/>
						</div>
						<Button type="submit" variant="outline" disabled={save.isPending}>
							<RefreshCwIcon /> Save
						</Button>
						<p className="basis-full text-[11.5px] text-muted-foreground">
							Charged off-session to the saved card, plus the top-up fee. A
							declined card turns auto top-up off and is logged in Activity.
						</p>
					</form>
				)}
			</div>
		</Panel>
	);
}
