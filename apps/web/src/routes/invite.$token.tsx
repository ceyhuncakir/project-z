import { Button, buttonVariants } from "@switchyard/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-form";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/invite/$token")({
	head: () => ({ meta: [{ title: "Invitation — HessianLabs" }] }),
	component: InvitePage,
});

function InvitePage() {
	const { token } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: session, isPending } = authClient.useSession();
	const invitation = useQuery(
		orpc.team.invitation.queryOptions({ input: { token } }),
	);
	const accept = useMutation(
		orpc.team.accept.mutationOptions({
			onSuccess: async (res) => {
				toast.success(`You joined ${res.ownerName}'s account`);
				await queryClient.invalidateQueries();
				navigate({ to: "/dashboard" });
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const here = `/invite/${token}`;

	if (invitation.isPending || isPending) return <AuthLayout>{null}</AuthLayout>;
	const inv = invitation.data;

	return (
		<AuthLayout>
			{!inv || inv.expired ? (
				<>
					<h1 className="font-medium text-2xl tracking-tight">
						This invitation {inv ? "expired" : "isn't valid"}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Invitations work for 7 days and once. Ask whoever invited you for a
						new one.
					</p>
				</>
			) : (
				<>
					<h1 className="font-medium text-2xl tracking-tight">
						Join {inv.ownerName}'s account
					</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						{inv.ownerName} ({inv.ownerEmail}) invited {inv.email} as{" "}
						{inv.role === "admin" ? "an admin" : "a member"}. You'll share their
						credits, cloud accounts, servers and API keys, and keep your own
						account too.
					</p>
					{!session ? (
						<div className="mt-8 flex flex-col gap-2">
							<Link
								to="/signup"
								search={{ redirect: here }}
								className={buttonVariants({ variant: "signal", size: "xl" })}
							>
								Create an account
							</Link>
							<Link
								to="/login"
								search={{ redirect: here }}
								className={buttonVariants({ variant: "outline", size: "xl" })}
							>
								I already have one: sign in
							</Link>
						</div>
					) : session.user.email.toLowerCase() !== inv.email ? (
						<div className="mt-8 space-y-3 text-sm">
							<p>
								You're signed in as {session.user.email}, but this invitation is
								for {inv.email}.
							</p>
							<Button
								variant="outline"
								onClick={() =>
									authClient.signOut({
										fetchOptions: {
											onSuccess: () =>
												navigate({ to: "/login", search: { redirect: here } }),
										},
									})
								}
							>
								Sign out and switch
							</Button>
						</div>
					) : (
						<Button
							variant="signal"
							size="xl"
							className="mt-8 w-full"
							disabled={accept.isPending}
							onClick={() => accept.mutate({ token })}
						>
							Accept invitation
						</Button>
					)}
				</>
			)}
		</AuthLayout>
	);
}
