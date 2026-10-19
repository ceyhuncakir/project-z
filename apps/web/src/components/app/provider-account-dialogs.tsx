import { Button } from "@switchyard/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@switchyard/ui/components/dialog";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { NativeSelect } from "@switchyard/ui/components/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PROVIDER_SETUP, SANDBOX_SETUP } from "@/lib/provider-setup";
import { orpc } from "@/utils/orpc";

import { ProviderLogo } from "../provider-logo";

export type ProviderTarget = { id: string; name: string };

/** The user's connected accounts, keyed by provider id. */
export function useProviderAccounts() {
	const accounts = useQuery(orpc.providerAccounts.list.queryOptions());
	const byProvider = new Map(
		(accounts.data ?? []).map((a) => [a.provider as string, a]),
	);
	return { ...accounts, byProvider };
}

/** How to create the credentials, the fields to paste them into, and a check with the provider. */
export function ConnectProviderDialog({
	target,
	onClose,
}: {
	target: ProviderTarget;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const meta = useQuery(orpc.meta.queryOptions());
	const setup =
		PROVIDER_SETUP[target.id] ??
		(meta.data?.cloudMode === "sandbox" ? SANDBOX_SETUP : null);
	const [values, setValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			(setup?.fields ?? []).map((f) => [f.key, f.options?.[0]?.value ?? ""]),
		),
	);
	const connect = useMutation(
		orpc.providerAccounts.connect.mutationOptions({
			onSuccess: () => {
				toast.success(`${target.name} connected`);
				queryClient.invalidateQueries();
				onClose();
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<ProviderLogo provider={target.id} className="size-9" />
						<div>
							<DialogTitle>Connect {target.name}</DialogTitle>
							<DialogDescription>
								Servers you create on {target.name} run in this account and are
								billed to it.
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>
				{setup ? (
					<form
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							connect.mutate({
								provider: target.id as never,
								credentials: Object.fromEntries(
									Object.entries(values).map(([k, v]) => [k, v.trim()]),
								),
							});
						}}
					>
						<ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] text-muted-foreground">
							{setup.steps.map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
						{setup.url && (
							<a
								href={setup.url}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1.5 text-[12.5px] underline underline-offset-4"
							>
								Open {new URL(setup.url).hostname}
								<ExternalLinkIcon className="size-3" />
							</a>
						)}
						{setup.fields.map((f) => (
							<div key={f.key} className="space-y-1.5">
								<Label htmlFor={`cred-${f.key}`}>{f.label}</Label>
								{f.options ? (
									<NativeSelect
										id={`cred-${f.key}`}
										value={values[f.key] ?? ""}
										onChange={(e) =>
											setValues({ ...values, [f.key]: e.target.value })
										}
									>
										{f.options.map((o) => (
											<option key={o.value} value={o.value}>
												{o.label}
											</option>
										))}
									</NativeSelect>
								) : (
									<Input
										id={`cred-${f.key}`}
										required
										type={f.secret ? "password" : "text"}
										autoComplete="off"
										spellCheck={false}
										className="font-mono text-[12px]"
										placeholder={f.placeholder}
										value={values[f.key] ?? ""}
										onChange={(e) =>
											setValues({ ...values, [f.key]: e.target.value })
										}
									/>
								)}
							</div>
						))}
						<DialogFooter>
							<DialogClose render={<Button variant="outline" />}>
								Cancel
							</DialogClose>
							<Button
								type="submit"
								variant="signal"
								disabled={connect.isPending}
							>
								{connect.isPending ? "Checking…" : "Check and connect"}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<p className="text-muted-foreground text-sm">
						{target.name} can't be connected yet.
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Forgets the credentials; the account's servers keep running there, unmanaged. */
export function DisconnectProviderDialog({
	target,
	account,
	onClose,
}: {
	target: ProviderTarget;
	account: { id: string; activeServers: number };
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const disconnect = useMutation(
		orpc.providerAccounts.disconnect.mutationOptions({
			onSuccess: (res) => {
				toast.success(
					res.detached
						? `Disconnected. ${res.detached} server(s) keep running there, unmanaged.`
						: "Disconnected",
				);
				queryClient.invalidateQueries();
				onClose();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Disconnect {target.name}?</DialogTitle>
					<DialogDescription>
						HessianLabs forgets these credentials.
						{account.activeServers
							? ` Your ${account.activeServers} active server(s) there keep running in your ${target.name} account, but HessianLabs stops managing them and stops charging their fee. Delete them first if you want them gone.`
							: ""}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose render={<Button variant="outline" />}>
						Cancel
					</DialogClose>
					<Button
						variant="destructive"
						disabled={disconnect.isPending}
						onClick={() => disconnect.mutate({ id: account.id })}
					>
						{disconnect.isPending ? "Disconnecting…" : "Disconnect"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
