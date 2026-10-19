import { Button } from "@switchyard/ui/components/button";
import { Checkbox } from "@switchyard/ui/components/checkbox";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthLayout } from "@/components/auth-form";
import { authClient } from "@/lib/auth-client";

// The password step passed; Better Auth holds the sign-in in a short-lived
// cookie until a code from the authenticator app (or a backup code) arrives.
export const Route = createFileRoute("/two-factor")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	head: () => ({ meta: [{ title: "Two-factor code — HessianLabs" }] }),
	component: TwoFactorPage,
});

function TwoFactorPage() {
	const { redirect } = Route.useSearch();
	const navigate = useNavigate();
	const [backup, setBackup] = useState(false);
	const [code, setCode] = useState("");
	const [trustDevice, setTrustDevice] = useState(false);
	const [pending, setPending] = useState(false);
	const target = redirect?.startsWith("/") ? redirect : "/dashboard";

	return (
		<AuthLayout>
			<h1 className="font-medium text-2xl tracking-tight">
				{backup ? "Use a backup code" : "Enter your code"}
			</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				{backup
					? "Each backup code works once. You got them when you turned on two-factor login."
					: "Open your authenticator app and enter the 6-digit code for HessianLabs."}
			</p>
			<form
				className="mt-8 space-y-4"
				onSubmit={async (e) => {
					e.preventDefault();
					setPending(true);
					const value = code.trim();
					const { error } = backup
						? await authClient.twoFactor.verifyBackupCode({
								code: value,
								trustDevice,
							})
						: await authClient.twoFactor.verifyTotp({
								code: value.replace(/\s/g, ""),
								trustDevice,
							});
					setPending(false);
					if (error) {
						toast.error(error.message || error.statusText);
						return;
					}
					navigate({ to: target });
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="code" className="text-[13px]">
						{backup ? "Backup code" : "Code"}
					</Label>
					<Input
						id="code"
						required
						autoFocus
						autoComplete="one-time-code"
						inputMode={backup ? "text" : "numeric"}
						className="h-10 font-mono text-sm tracking-widest"
						placeholder={backup ? "xxxxx-xxxxx" : "123 456"}
						value={code}
						onChange={(e) => setCode(e.target.value)}
					/>
				</div>
				<Label className="gap-2 font-normal text-[12.5px] text-muted-foreground">
					<Checkbox
						checked={trustDevice}
						onCheckedChange={(checked) => setTrustDevice(checked)}
					/>
					Don't ask again on this device for 30 days
				</Label>
				<Button
					type="submit"
					variant="signal"
					size="xl"
					className="w-full"
					disabled={pending}
				>
					{pending ? "One moment…" : "Sign in"}
				</Button>
			</form>
			<p className="mt-6 text-muted-foreground text-sm">
				<button
					type="button"
					className="text-foreground underline underline-offset-4"
					onClick={() => {
						setBackup(!backup);
						setCode("");
					}}
				>
					{backup ? "Use the authenticator app" : "Use a backup code"}
				</button>
				{" · "}
				<Link
					to="/login"
					className="text-foreground underline underline-offset-4"
				>
					Start over
				</Link>
			</p>
		</AuthLayout>
	);
}
