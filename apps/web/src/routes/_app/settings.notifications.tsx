import { Button } from "@switchyard/ui/components/button";
import { Checkbox } from "@switchyard/ui/components/checkbox";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	Panel,
	useAccounts,
	useActiveAccountName,
} from "@/components/app/app-shell";
import { authClient } from "@/lib/auth-client";
import { formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/settings/notifications")({
	head: () => ({ meta: [{ title: "Notifications — HessianLabs" }] }),
	component: NotificationsPage,
});

type Kind =
	| "providerProblems"
	| "autoTopupFailed"
	| "lowBalance"
	| "longRunning"
	| "serverExpiry"
	| "newSignIn";

const ACCOUNT: { kind: Kind; title: string; description: string }[] = [
	{
		kind: "providerProblems",
		title: "A cloud account stops working",
		description:
			"The provider rejects the saved credentials. Its servers keep running, and costing, at the provider, but HessianLabs stops managing them.",
	},
	{
		kind: "longRunning",
		title: "A server runs for a long time",
		description:
			"Once per server, after the number of hours set in Guardrails. Servers with a time limit are skipped.",
	},
	{
		kind: "serverExpiry",
		title: "A server's time limit ends",
		description:
			"An hour before it's deleted, so you can keep it, and again once it's gone.",
	},
	{
		kind: "autoTopupFailed",
		title: "Auto top-up fails",
		description: "The saved card is declined and auto top-up turns itself off.",
	},
];

function NotificationsPage() {
	const { data: session } = authClient.useSession();
	const settings = useQuery(orpc.notifications.get.queryOptions());
	return (
		<>
			<PageHeader
				title="Notifications"
				description={
					<>
						Which emails you get
						{session && (
							<>
								{" "}
								at <span className="text-foreground">{session.user.email}</span>
							</>
						)}
						. Password resets, email changes and invitations always go out.
					</>
				}
			/>
			{settings.data && (
				<div className="max-w-3xl space-y-6">
					<NotificationsPanels settings={settings.data} />
				</div>
			)}
		</>
	);
}

function NotificationsPanels({
	settings,
}: {
	settings: Record<Kind, boolean> & { lowBalanceThresholdMicros: number };
}) {
	const queryClient = useQueryClient();
	const accountName = useActiveAccountName();
	const role = useAccounts().data?.active.role;
	const canEditThreshold = role === "owner" || role === "admin";
	const [threshold, setThreshold] = useState(
		settings.lowBalanceThresholdMicros / 1e6,
	);
	const refresh = () =>
		queryClient.invalidateQueries(orpc.notifications.get.queryOptions());
	const update = useMutation(
		orpc.notifications.update.mutationOptions({
			onSuccess: refresh,
			onError: (e) => toast.error(e.message),
		}),
	);
	const saveThreshold = useMutation(
		orpc.notifications.setLowBalanceThreshold.mutationOptions({
			onSuccess: () => {
				toast.success("Threshold saved");
				refresh();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	// Show a toggle's new state while it saves.
	const checked = (kind: Kind) =>
		(update.isPending ? update.variables?.[kind] : undefined) ?? settings[kind];
	const toggle = (kind: Kind) => ({
		id: `notify-${kind}`,
		checked: checked(kind),
		onChange: (value: boolean) => update.mutate({ [kind]: value }),
	});

	return (
		<>
			<Panel title={`${accountName}: email me when`}>
				<div className="divide-y">
					{ACCOUNT.slice(0, 1).map(({ kind, title, description }) => (
						<Toggle key={kind} {...toggle(kind)} title={title}>
							{description}
						</Toggle>
					))}
					<Toggle {...toggle("lowBalance")} title="The balance runs low">
						Once each time it drops below{" "}
						{canEditThreshold
							? "this amount"
							: formatUsd(settings.lowBalanceThresholdMicros)}
						. Not sent while auto top-up is on: it refills the balance, and
						emails if it can't.
						{canEditThreshold && (
							<form
								className="mt-3 flex items-end gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									saveThreshold.mutate({ usd: threshold });
								}}
							>
								<div className="space-y-1.5">
									<Label
										htmlFor="low-balance-threshold"
										className="text-[12px] text-muted-foreground"
									>
										Below (USD)
									</Label>
									<Input
										id="low-balance-threshold"
										type="number"
										min={1}
										max={10_000}
										step="any"
										className="w-32 font-mono"
										value={threshold}
										onChange={(e) => setThreshold(Number(e.target.value))}
									/>
								</div>
								<Button
									type="submit"
									variant="outline"
									disabled={
										saveThreshold.isPending ||
										threshold * 1e6 === settings.lowBalanceThresholdMicros
									}
								>
									Save
								</Button>
							</form>
						)}
					</Toggle>
					{ACCOUNT.slice(1).map(({ kind, title, description }) => (
						<Toggle key={kind} {...toggle(kind)} title={title}>
							{description}
						</Toggle>
					))}
				</div>
			</Panel>
			<Panel title="Your sign-ins">
				<Toggle
					{...toggle("newSignIn")}
					title="Someone signs in from a new device"
				>
					A browser or device you haven't signed in from before, with its IP
					address, so you can sign it out if it wasn't you.
				</Toggle>
			</Panel>
			<p className="text-[12px] text-muted-foreground">
				Account emails go to the account's owner and admins, each by their own
				choices here.
			</p>
		</>
	);
}

function Toggle({
	id,
	title,
	checked,
	onChange,
	children,
}: {
	id: string;
	title: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	children: ReactNode;
}) {
	return (
		<div className="flex items-start gap-3 px-4 py-4">
			<Checkbox
				id={id}
				className="mt-0.5"
				checked={checked}
				onCheckedChange={onChange}
			/>
			<div className="min-w-0 flex-1">
				<Label htmlFor={id} className="text-[13px]">
					{title}
				</Label>
				<div className="mt-1 max-w-xl text-[12px] text-muted-foreground">
					{children}
				</div>
			</div>
		</div>
	);
}
