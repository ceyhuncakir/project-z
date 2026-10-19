import { Button } from "@switchyard/ui/components/button";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthLayout } from "@/components/auth-form";
import { authClient } from "@/lib/auth-client";

// The emailed link goes through the API, which sends the browser back here
// with ?token=… or, when the link is expired or used, ?error=INVALID_TOKEN.
export const Route = createFileRoute("/reset-password")({
	validateSearch: z.object({
		token: z.string().optional(),
		error: z.string().optional(),
	}),
	head: () => ({ meta: [{ title: "Reset password — HessianLabs" }] }),
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const { token, error } = Route.useSearch();
	return (
		<AuthLayout>
			{token ? (
				<ChoosePassword token={token} />
			) : (
				<RequestLink expired={Boolean(error)} />
			)}
			<p className="mt-6 text-muted-foreground text-sm">
				Remembered it?{" "}
				<Link
					to="/login"
					className="text-foreground underline underline-offset-4"
				>
					Sign in
				</Link>
			</p>
		</AuthLayout>
	);
}

function RequestLink({ expired }: { expired: boolean }) {
	const [email, setEmail] = useState("");
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	if (sentTo) {
		return (
			<>
				<h1 className="font-medium text-2xl tracking-tight">
					Check your email
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					If {sentTo} has an account, a link to choose a new password is on its
					way. It works for an hour.
				</p>
			</>
		);
	}

	return (
		<>
			<h1 className="font-medium text-2xl tracking-tight">
				Reset your password
			</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				{expired
					? "That link expired or was already used. Ask for a new one."
					: "We'll email you a link to choose a new one."}
			</p>
			<form
				className="mt-8 space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					setPending(true);
					const { error } = await authClient.requestPasswordReset({
						email,
						redirectTo: `${window.location.origin}/reset-password`,
					});
					setPending(false);
					if (error) toast.error(error.message || error.statusText);
					else setSentTo(email);
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="email" className="text-[13px]">
						Email
					</Label>
					<Input
						id="email"
						type="email"
						autoComplete="email"
						required
						className="h-10 text-sm"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</div>
				<Button
					type="submit"
					variant="signal"
					size="xl"
					className="w-full"
					disabled={pending}
				>
					{pending ? "One moment…" : "Email me a link"}
				</Button>
			</form>
		</>
	);
}

function ChoosePassword({ token }: { token: string }) {
	const navigate = useNavigate();
	const [password, setPassword] = useState("");
	const [pending, setPending] = useState(false);

	return (
		<>
			<h1 className="font-medium text-2xl tracking-tight">
				Choose a new password
			</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				This signs you out everywhere; sign in again with the new password.
			</p>
			<form
				className="mt-8 space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					setPending(true);
					const { error } = await authClient.resetPassword({
						newPassword: password,
						token,
					});
					setPending(false);
					if (error) {
						toast.error(error.message || error.statusText);
						return;
					}
					toast.success("Password changed. Sign in with the new one.");
					navigate({ to: "/login" });
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="password" className="text-[13px]">
						New password
					</Label>
					<Input
						id="password"
						type="password"
						autoComplete="new-password"
						required
						minLength={8}
						className="h-10 text-sm"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<p className="text-[11.5px] text-muted-foreground">
						At least 8 characters.
					</p>
				</div>
				<Button
					type="submit"
					variant="signal"
					size="xl"
					className="w-full"
					disabled={pending}
				>
					{pending ? "One moment…" : "Change password"}
				</Button>
			</form>
		</>
	);
}
