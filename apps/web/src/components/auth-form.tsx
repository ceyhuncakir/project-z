import { Button } from "@switchyard/ui/components/button";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { cn } from "@switchyard/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";
import { site } from "@/lib/site";
import { orpc } from "@/utils/orpc";

import { Logo } from "./brand";

const schemas = {
	signin: z.object({
		name: z.string(),
		email: z.email("Enter a valid email"),
		password: z.string().min(8, "At least 8 characters"),
	}),
	signup: z.object({
		name: z.string().min(2, "At least 2 characters"),
		email: z.email("Enter a valid email"),
		password: z.string().min(8, "At least 8 characters"),
	}),
};

export function AuthForm({
	mode,
	redirect,
}: {
	mode: "signin" | "signup";
	redirect?: string;
}) {
	const navigate = useNavigate();
	const meta = useQuery(orpc.meta.queryOptions());
	const target = redirect?.startsWith("/") ? redirect : "/dashboard";

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		validators: { onSubmit: schemas[mode] },
		onSubmit: async ({ value }) => {
			const handlers = {
				onSuccess: () => navigate({ to: target }),
				onError: (ctx: { error: { message?: string; statusText: string } }) => {
					toast.error(ctx.error.message || ctx.error.statusText);
				},
			};
			if (mode === "signup") await authClient.signUp.email(value, handlers);
			else
				await authClient.signIn.email(
					{ email: value.email, password: value.password },
					handlers,
				);
		},
	});

	return (
		<div className="grid min-h-svh lg:grid-cols-2">
			<div className="flex flex-col px-6 py-6 sm:px-10">
				<Logo />
				<div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
					<h1 className="font-medium text-2xl tracking-tight">
						{mode === "signup" ? "Create your account" : "Welcome back"}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{mode === "signup"
							? "Add credits, connect your agent, ship servers."
							: `Sign in to ${site.name}.`}
					</p>

					{meta.data?.githubAuth && (
						<>
							<Button
								variant="outline"
								size="lg"
								className="mt-8 w-full"
								onClick={() =>
									authClient.signIn.social({
										provider: "github",
										callbackURL: `${window.location.origin}${target}`,
									})
								}
							>
								Continue with GitHub
							</Button>
							<div className="my-6 flex items-center gap-3">
								<div className="h-px flex-1 bg-border" />
								<span className="label-mono">or</span>
								<div className="h-px flex-1 bg-border" />
							</div>
						</>
					)}

					<form
						className={cn("space-y-4", !meta.data?.githubAuth && "mt-8")}
						onSubmit={(e) => {
							e.preventDefault();
							form.handleSubmit();
						}}
					>
						{(mode === "signup"
							? (["name", "email", "password"] as const)
							: (["email", "password"] as const)
						).map((name) => (
							<form.Field key={name} name={name}>
								{(field) => (
									<div className="space-y-1.5">
										<Label htmlFor={field.name} className="text-[13px]">
											{name === "name"
												? "Name"
												: name === "email"
													? "Email"
													: "Password"}
										</Label>
										<Input
											id={field.name}
											name={field.name}
											type={name === "name" ? "text" : name}
											autoComplete={
												name === "password"
													? mode === "signup"
														? "new-password"
														: "current-password"
													: name
											}
											className="h-10 text-sm"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
										{field.state.meta.errors.map((error) => (
											<p
												key={error?.message}
												className="text-destructive text-xs"
											>
												{error?.message}
											</p>
										))}
									</div>
								)}
							</form.Field>
						))}
						<form.Subscribe selector={(s) => s.isSubmitting}>
							{(submitting) => (
								<Button
									type="submit"
									variant="signal"
									size="xl"
									className="w-full"
									disabled={submitting}
								>
									{submitting
										? "One moment…"
										: mode === "signup"
											? "Create account"
											: "Sign in"}
								</Button>
							)}
						</form.Subscribe>
					</form>

					<p className="mt-6 text-muted-foreground text-sm">
						{mode === "signup" ? "Already have an account? " : "New here? "}
						<Link
							to={mode === "signup" ? "/login" : "/signup"}
							search={redirect ? { redirect } : undefined}
							className="text-foreground underline underline-offset-4"
						>
							{mode === "signup" ? "Sign in" : "Create an account"}
						</Link>
					</p>
				</div>
			</div>
			<AuthAside />
		</div>
	);
}

function AuthAside() {
	return (
		<div className="relative hidden overflow-hidden border-l bg-foreground text-background lg:flex lg:flex-col lg:justify-between lg:p-10">
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.08]"
				style={{
					backgroundImage:
						"linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
					backgroundSize: "48px 48px",
				}}
			/>
			<p className="relative font-mono text-[11px] text-background/60 uppercase tracking-[0.08em]">
				<span className="text-signal">●</span> mcp · streamable http
			</p>
			<blockquote className="relative max-w-md">
				<p className="font-medium text-3xl leading-tight tracking-tight">
					“Spin up a box in Europe, run the tests, clean up after yourself.”
				</p>
				<footer className="mt-4 font-mono text-[12px] text-background/60">
					— every prompt your agent can now finish on its own
				</footer>
			</blockquote>
			<div className="relative grid grid-cols-3 gap-px bg-background/10 font-mono text-[11px]">
				{[
					["6", "providers"],
					["per-min", "billing"],
					["1", "balance"],
				].map(([v, k]) => (
					<div key={k} className="bg-foreground p-3">
						<p className="text-background text-lg">{v}</p>
						<p className="text-background/50">{k}</p>
					</div>
				))}
			</div>
		</div>
	);
}
