import { Badge } from "@switchyard/ui/components/badge";
import { Button, buttonVariants } from "@switchyard/ui/components/button";
import { Checkbox } from "@switchyard/ui/components/checkbox";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { encode } from "uqr";
import { z } from "zod";

import { PageHeader, Panel } from "@/components/app/app-shell";
import {
	appUrl,
	SettingsRow,
	unwrap,
	useReturnedError,
} from "@/components/app/settings";
import { authClient } from "@/lib/auth-client";
import { describeAgent, timeAgo } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/settings/security")({
	// GitHub linking comes back here.
	validateSearch: z.object({ error: z.string().optional() }),
	head: () => ({ meta: [{ title: "Security — HessianLabs" }] }),
	component: SecurityPage,
});

function useAccounts() {
	return useQuery({
		queryKey: ["auth", "accounts"],
		queryFn: () => unwrap(authClient.listAccounts()),
	});
}

function SecurityPage() {
	useReturnedError(Route.useSearch().error, "/settings/security");
	const { data: session } = authClient.useSession();
	return (
		<>
			<PageHeader
				title="Security"
				description="How you sign in to HessianLabs, and what happened recently."
			/>
			{session && (
				<div className="max-w-3xl space-y-6">
					<SignInPanel
						email={session.user.email}
						twoFactorEnabled={Boolean(session.user.twoFactorEnabled)}
					/>
					<SecurityLog />
				</div>
			)}
		</>
	);
}

function SignInPanel({
	email,
	twoFactorEnabled,
}: {
	email: string;
	twoFactorEnabled: boolean;
}) {
	const queryClient = useQueryClient();
	const meta = useQuery(orpc.meta.queryOptions());
	const accounts = useAccounts();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [signOutOthers, setSignOutOthers] = useState(true);
	const [linkSent, setLinkSent] = useState(false);

	const changePassword = useMutation({
		mutationFn: () =>
			unwrap(
				authClient.changePassword({
					currentPassword: current,
					newPassword: next,
					revokeOtherSessions: signOutOthers,
				}),
			),
		onSuccess: () => {
			toast.success("Password changed");
			setCurrent("");
			setNext("");
			queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
			queryClient.invalidateQueries(orpc.privacy.securityEvents.queryOptions());
		},
		onError: (e) => toast.error(e.message),
	});
	const sendSetLink = useMutation({
		mutationFn: () =>
			unwrap(
				authClient.requestPasswordReset({
					email,
					redirectTo: appUrl("/reset-password"),
				}),
			),
		onSuccess: () => setLinkSent(true),
		onError: (e) => toast.error(e.message),
	});
	const unlinkGithub = useMutation({
		// The account row's id, not GitHub's user id.
		mutationFn: (id: string) =>
			unwrap(authClient.unlinkAccount({ accountId: id })),
		onSuccess: () => {
			toast.success("GitHub disconnected");
			queryClient.invalidateQueries({ queryKey: ["auth", "accounts"] });
		},
		onError: (e) => toast.error(e.message),
	});

	if (!accounts.data) return null;
	const hasPassword = accounts.data.some((a) => a.providerId === "credential");
	const github = accounts.data.find((a) => a.providerId === "github");

	return (
		<Panel>
			<div className="divide-y">
				{hasPassword ? (
					<SettingsRow label="Password" htmlFor="current-password">
						<form
							className="space-y-3"
							onSubmit={(e) => {
								e.preventDefault();
								changePassword.mutate();
							}}
						>
							<Input
								id="current-password"
								type="password"
								autoComplete="current-password"
								required
								placeholder="Current password"
								value={current}
								onChange={(e) => setCurrent(e.target.value)}
							/>
							<Input
								type="password"
								aria-label="New password"
								autoComplete="new-password"
								required
								minLength={8}
								placeholder="New password, at least 8 characters"
								value={next}
								onChange={(e) => setNext(e.target.value)}
							/>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<Label className="gap-2 font-normal text-[12.5px] text-muted-foreground">
									<Checkbox
										checked={signOutOthers}
										onCheckedChange={(checked) => setSignOutOthers(checked)}
									/>
									Sign out everywhere else
								</Label>
								<Button
									type="submit"
									variant="outline"
									disabled={changePassword.isPending}
								>
									Change password
								</Button>
							</div>
						</form>
					</SettingsRow>
				) : (
					<SettingsRow
						label="Password"
						hint="Not set: you sign in with GitHub."
					>
						{linkSent ? (
							<p className="text-[13px] text-muted-foreground">
								We emailed {email} a link to choose a password. Setting it signs
								you out everywhere; sign in again with either method.
							</p>
						) : (
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p className="text-[13px] text-muted-foreground">
									To sign in with {email} and a password too, we'll email you a
									link to set one.
								</p>
								<Button
									variant="outline"
									disabled={sendSetLink.isPending}
									onClick={() => sendSetLink.mutate()}
								>
									Email me a link
								</Button>
							</div>
						)}
					</SettingsRow>
				)}
				<SettingsRow
					label="Two-factor login"
					hint="A code from an authenticator app, asked for after your password."
				>
					{hasPassword ? (
						<TwoFactor enabled={twoFactorEnabled} />
					) : (
						<p className="text-[13px] text-muted-foreground">
							Two-factor login protects password sign-ins. Signing in with
							GitHub uses GitHub's own two-factor; set a password first to add
							it here too.
						</p>
					)}
				</SettingsRow>
				{(meta.data?.githubAuth || github) && (
					<SettingsRow label="GitHub">
						<div className="flex flex-wrap items-center justify-between gap-3">
							{github ? (
								<>
									<Badge variant="go">connected</Badge>
									<Button
										variant="ghost"
										size="sm"
										className="text-destructive"
										// The last sign-in method can't be removed.
										disabled={!hasPassword || unlinkGithub.isPending}
										title={hasPassword ? undefined : "Set a password first"}
										onClick={() => unlinkGithub.mutate(github.id)}
									>
										Disconnect
									</Button>
								</>
							) : (
								<>
									<p className="text-[13px] text-muted-foreground">
										Sign in with your GitHub account too.
									</p>
									<Button
										variant="outline"
										onClick={() =>
											authClient.linkSocial({
												provider: "github",
												callbackURL: appUrl("/settings/security"),
												errorCallbackURL: appUrl("/settings/security"),
											})
										}
									>
										Connect GitHub
									</Button>
								</>
							)}
						</div>
					</SettingsRow>
				)}
			</div>
		</Panel>
	);
}

type Step =
	| { kind: "idle" }
	| { kind: "password"; action: "enable" | "disable" | "codes" }
	| { kind: "scan"; totpURI: string; backupCodes: string[] }
	| { kind: "codes"; backupCodes: string[] };

/**
 * Turning it on: password → scan the QR code → enter a code to prove the app
 * works → save the backup codes. Off and new codes also need the password.
 */
function TwoFactor({ enabled }: { enabled: boolean }) {
	const queryClient = useQueryClient();
	const { refetch } = authClient.useSession();
	const [step, setStep] = useState<Step>({ kind: "idle" });
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);

	const done = async () => {
		await refetch();
		queryClient.invalidateQueries(orpc.privacy.securityEvents.queryOptions());
	};
	const run = async (
		fn: () => Promise<{
			error: { message?: string; statusText: string } | null;
		}>,
	) => {
		setPending(true);
		const { error } = await fn();
		setPending(false);
		if (error) toast.error(error.message || error.statusText);
		return !error;
	};

	if (step.kind === "password") {
		return (
			<form
				className="flex flex-wrap gap-2"
				onSubmit={async (e) => {
					e.preventDefault();
					if (step.action === "enable") {
						await run(async () => {
							const res = await authClient.twoFactor.enable({ password });
							if (res.data && "totpURI" in res.data) {
								setStep({
									kind: "scan",
									totpURI: res.data.totpURI,
									backupCodes: res.data.backupCodes,
								});
							}
							return res;
						});
					} else if (step.action === "disable") {
						if (await run(() => authClient.twoFactor.disable({ password }))) {
							toast.success("Two-factor login is off");
							setStep({ kind: "idle" });
							await done();
						}
					} else {
						await run(async () => {
							const res = await authClient.twoFactor.generateBackupCodes({
								password,
							});
							if (res.data)
								setStep({ kind: "codes", backupCodes: res.data.backupCodes });
							return res;
						});
						await done();
					}
					setPassword("");
				}}
			>
				<Input
					type="password"
					aria-label="Your password"
					autoComplete="current-password"
					autoFocus
					required
					placeholder="Your password, to confirm"
					className="min-w-48 flex-1"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>
				<Button type="submit" variant="outline" disabled={pending}>
					Continue
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={() => setStep({ kind: "idle" })}
				>
					Cancel
				</Button>
			</form>
		);
	}

	if (step.kind === "scan") {
		const secret = new URL(step.totpURI).searchParams.get("secret");
		return (
			<div className="space-y-3">
				<p className="text-[13px] text-muted-foreground">
					Scan this with your authenticator app (1Password, Google
					Authenticator, Authy…), then enter the code it shows.
				</p>
				<div className="flex flex-wrap items-start gap-4">
					<QrCode value={step.totpURI} />
					<div className="min-w-0 flex-1 space-y-1.5">
						<p className="text-[12px] text-muted-foreground">
							Can't scan? Enter this key:
						</p>
						<p className="break-all font-mono text-[12px]">{secret}</p>
					</div>
				</div>
				<form
					className="flex gap-2"
					onSubmit={async (e) => {
						e.preventDefault();
						const ok = await run(() =>
							authClient.twoFactor.verifyTotp({
								code: code.replace(/\s/g, ""),
							}),
						);
						if (!ok) return;
						toast.success("Two-factor login is on");
						setCode("");
						setStep({ kind: "codes", backupCodes: step.backupCodes });
						await done();
					}}
				>
					<Input
						aria-label="Code from the app"
						autoComplete="one-time-code"
						inputMode="numeric"
						required
						placeholder="123 456"
						className="w-36 font-mono tracking-widest"
						value={code}
						onChange={(e) => setCode(e.target.value)}
					/>
					<Button type="submit" variant="outline" disabled={pending}>
						Turn on
					</Button>
					<Button
						type="button"
						variant="ghost"
						onClick={() => setStep({ kind: "idle" })}
					>
						Cancel
					</Button>
				</form>
			</div>
		);
	}

	if (step.kind === "codes") {
		const text = step.backupCodes.join("\n");
		return (
			<div className="space-y-3">
				<p className="text-[13px]">
					Save these backup codes somewhere safe. Each one signs you in once if
					you lose your phone, and they're only shown now.
				</p>
				<ul className="grid grid-cols-2 gap-x-6 gap-y-1 border bg-muted/40 p-3 font-mono text-[12.5px] sm:grid-cols-3">
					{step.backupCodes.map((c) => (
						<li key={c}>{c}</li>
					))}
				</ul>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={async () => {
							await navigator.clipboard.writeText(text);
							toast.success("Copied");
						}}
					>
						Copy
					</Button>
					<a
						href={`data:text/plain;charset=utf-8,${encodeURIComponent(`HessianLabs backup codes\n\n${text}\n`)}`}
						download="hessianlabs-backup-codes.txt"
						className={buttonVariants({ variant: "outline" })}
					>
						Download
					</a>
					<Button variant="ghost" onClick={() => setStep({ kind: "idle" })}>
						I've saved them
					</Button>
				</div>
			</div>
		);
	}

	return enabled ? (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<Badge variant="go">on</Badge>
			<div className="flex gap-2">
				<Button
					variant="outline"
					onClick={() => setStep({ kind: "password", action: "codes" })}
				>
					New backup codes
				</Button>
				<Button
					variant="ghost"
					className="text-destructive"
					onClick={() => setStep({ kind: "password", action: "disable" })}
				>
					Turn off
				</Button>
			</div>
		</div>
	) : (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<Badge variant="warn">off</Badge>
			<Button
				variant="outline"
				onClick={() => setStep({ kind: "password", action: "enable" })}
			>
				Turn on
			</Button>
		</div>
	);
}

/** Dark modules on white whatever the theme: scanners need the contrast. */
function QrCode({ value }: { value: string }) {
	const { data, size } = encode(value, { border: 2 });
	let d = "";
	data.forEach((row, y) => {
		row.forEach((dark, x) => {
			if (dark) d += `M${x} ${y}h1v1h-1z`;
		});
	});
	return (
		<svg
			viewBox={`0 0 ${size} ${size}`}
			className="size-40 shrink-0 border"
			shapeRendering="crispEdges"
			role="img"
			aria-label="QR code for your authenticator app"
		>
			<rect width={size} height={size} fill="#fff" />
			<path d={d} fill="#000" />
		</svg>
	);
}

function SecurityLog() {
	const events = useQuery(orpc.privacy.securityEvents.queryOptions());
	return (
		<Panel title="Recent security activity">
			<ul className="divide-y">
				{events.data?.map((e) => (
					<li key={e.id} className="px-4 py-3">
						<p className="text-[13px]">{e.message}</p>
						<p className="truncate font-mono text-[11px] text-muted-foreground">
							{timeAgo(e.createdAt)}
							{e.userAgent && ` · ${describeAgent(e.userAgent)}`}
							{e.ipAddress && ` · ${e.ipAddress}`}
						</p>
					</li>
				))}
				{events.data?.length === 0 && (
					<li className="px-4 py-10 text-center text-muted-foreground text-sm">
						Sign-ins and changes to how you sign in show up here.
					</li>
				)}
			</ul>
		</Panel>
	);
}
