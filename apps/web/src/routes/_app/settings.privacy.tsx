import { Button } from "@switchyard/ui/components/button";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, Panel, useAccounts } from "@/components/app/app-shell";
import { appUrl, unwrap } from "@/components/app/settings";
import { authClient } from "@/lib/auth-client";
import { formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/settings/privacy")({
	head: () => ({ meta: [{ title: "Data & privacy — HessianLabs" }] }),
	component: PrivacyPage,
});

function PrivacyPage() {
	return (
		<>
			<PageHeader
				title="Data & privacy"
				description="Take a copy of what HessianLabs stores about you, or delete your account."
			/>
			<div className="max-w-3xl space-y-6">
				<ExportPanel />
				<DeletePanel />
			</div>
		</>
	);
}

function ExportPanel() {
	const role = useAccounts().data?.active.role;
	const download = useMutation(
		orpc.privacy.export.mutationOptions({
			onSuccess: (data) => {
				const blob = new Blob([JSON.stringify(data, null, 2)], {
					type: "application/json",
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `hessianlabs-export-${new Date().toISOString().slice(0, 10)}.json`;
				a.click();
				URL.revokeObjectURL(url);
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	return (
		<Panel title="Download your data">
			<div className="flex flex-wrap items-center justify-between gap-4 p-4">
				<p className="max-w-lg text-[13px] text-muted-foreground">
					A JSON file with your profile, sign-ins and settings
					{role === "member"
						? "."
						: ", plus this account's servers, credit history, activity, API keys and cloud accounts."}{" "}
					Secrets stay out: no passwords, key hashes or cloud credentials.
				</p>
				<Button
					variant="outline"
					disabled={download.isPending}
					onClick={() => download.mutate({})}
				>
					{download.isPending ? "Preparing…" : "Download"}
				</Button>
			</div>
		</Panel>
	);
}

function DeletePanel() {
	const check = useQuery(orpc.privacy.deletionCheck.queryOptions());
	const accounts = useQuery({
		queryKey: ["auth", "accounts"],
		queryFn: () => unwrap(authClient.listAccounts()),
	});
	const { data: session } = authClient.useSession();
	const [password, setPassword] = useState("");
	const [sent, setSent] = useState(false);
	const hasPassword = accounts.data?.some((a) => a.providerId === "credential");

	const request = useMutation({
		mutationFn: () =>
			unwrap(
				authClient.deleteUser({
					password: hasPassword ? password : undefined,
					callbackURL: appUrl("/"),
				}),
			),
		onSuccess: () => setSent(true),
		onError: (e) => toast.error(e.message),
	});

	if (!check.data) return null;
	const { blockers, balanceMicros } = check.data;

	return (
		<Panel title="Delete your account" className="border-destructive/40">
			<div className="space-y-4 p-4">
				<p className="text-[13px] text-muted-foreground">
					Deletes you and your own account for good: profile, API keys, SSH
					keys, saved cloud credentials, credit balance and history. Stripe
					keeps its payment records. You also leave any team you're in.
				</p>
				{blockers.length > 0 ? (
					<ul className="space-y-2 border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px]">
						{blockers.map((b) => (
							<li key={b}>{b}</li>
						))}
					</ul>
				) : sent ? (
					<p className="text-[13px]">
						We emailed {session?.user.email} a link to confirm. Your account is
						deleted when you open it, within a day.
					</p>
				) : (
					<form
						className="space-y-3"
						onSubmit={(e) => {
							e.preventDefault();
							request.mutate();
						}}
					>
						{balanceMicros > 0 && (
							<p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px]">
								Your remaining balance of {formatUsd(balanceMicros)} is lost
								when the account is deleted.
							</p>
						)}
						{hasPassword && (
							<div className="max-w-sm space-y-1.5">
								<Label htmlFor="delete-password" className="text-[12px]">
									Your password
								</Label>
								<Input
									id="delete-password"
									type="password"
									autoComplete="current-password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
							</div>
						)}
						<Button
							type="submit"
							variant="destructive"
							disabled={request.isPending}
						>
							Email me a confirmation link
						</Button>
					</form>
				)}
			</div>
		</Panel>
	);
}
