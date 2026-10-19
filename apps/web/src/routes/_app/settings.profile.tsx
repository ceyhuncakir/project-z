import { Badge } from "@switchyard/ui/components/badge";
import { Button } from "@switchyard/ui/components/button";
import { Input } from "@switchyard/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader, Panel } from "@/components/app/app-shell";
import {
	appUrl,
	SettingsRow,
	unwrap,
	useReturnedError,
} from "@/components/app/settings";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/settings/profile")({
	// Email change and verification links come back here.
	validateSearch: z.object({ error: z.string().optional() }),
	head: () => ({ meta: [{ title: "Profile — HessianLabs" }] }),
	component: ProfilePage,
});

function ProfilePage() {
	useReturnedError(Route.useSearch().error, "/settings/profile");
	const { data: session } = authClient.useSession();
	return (
		<>
			<PageHeader
				title="Profile"
				description="Your name and the email HessianLabs writes to."
			/>
			{session && (
				<div className="max-w-3xl">
					<ProfilePanel user={session.user} />
				</div>
			)}
		</>
	);
}

function ProfilePanel({
	user,
}: {
	user: { name: string; email: string; emailVerified: boolean };
}) {
	const [name, setName] = useState(user.name);
	const [newEmail, setNewEmail] = useState("");
	const [emailSent, setEmailSent] = useState<string | null>(null);
	const callbackURL = appUrl("/settings/profile");

	const saveName = useMutation({
		mutationFn: () => unwrap(authClient.updateUser({ name: name.trim() })),
		onSuccess: () => toast.success("Name saved"),
		onError: (e) => toast.error(e.message),
	});
	const changeEmail = useMutation({
		mutationFn: (email: string) =>
			unwrap(authClient.changeEmail({ newEmail: email, callbackURL })),
		onSuccess: (_, email) => {
			// A verified address approves the change first; otherwise the new
			// address confirms it directly.
			setEmailSent(
				user.emailVerified
					? `We emailed ${user.email} to approve the change to ${email}. After that, ${email} gets a link to confirm it.`
					: `We emailed ${email} a link to confirm it. Your email changes when you open it.`,
			);
			setNewEmail("");
		},
		onError: (e) => toast.error(e.message),
	});
	const resend = useMutation({
		mutationFn: () =>
			unwrap(
				authClient.sendVerificationEmail({ email: user.email, callbackURL }),
			),
		onSuccess: () => toast.success(`Verification link sent to ${user.email}`),
		onError: (e) => toast.error(e.message),
	});

	return (
		<Panel>
			<div className="divide-y">
				<SettingsRow label="Name" htmlFor="settings-name">
					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							saveName.mutate();
						}}
					>
						<Input
							id="settings-name"
							required
							minLength={2}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<Button
							type="submit"
							variant="outline"
							disabled={
								saveName.isPending ||
								name.trim().length < 2 ||
								name.trim() === user.name
							}
						>
							Save
						</Button>
					</form>
				</SettingsRow>
				<SettingsRow
					label="Email"
					htmlFor="settings-email"
					hint="Password resets and account notices go here."
				>
					<div className="flex flex-wrap items-center gap-2 text-[13px]">
						<span className="font-mono">{user.email}</span>
						{user.emailVerified ? (
							<Badge variant="go">verified</Badge>
						) : (
							<>
								<Badge variant="warn">unverified</Badge>
								<Button
									variant="ghost"
									size="xs"
									disabled={resend.isPending}
									onClick={() => resend.mutate()}
								>
									Resend link
								</Button>
							</>
						)}
					</div>
					<form
						className="mt-3 flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							changeEmail.mutate(newEmail.trim());
						}}
					>
						<Input
							id="settings-email"
							type="email"
							required
							placeholder="New email"
							value={newEmail}
							onChange={(e) => setNewEmail(e.target.value)}
						/>
						<Button
							type="submit"
							variant="outline"
							disabled={changeEmail.isPending}
						>
							Change
						</Button>
					</form>
					{emailSent && (
						<p className="mt-2 text-[12px] text-muted-foreground">
							{emailSent}
						</p>
					)}
				</SettingsRow>
			</div>
		</Panel>
	);
}
