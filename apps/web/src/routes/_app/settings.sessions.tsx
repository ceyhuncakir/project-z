import { Badge } from "@switchyard/ui/components/badge";
import { Button } from "@switchyard/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/app/app-shell";
import { unwrap } from "@/components/app/settings";
import { authClient } from "@/lib/auth-client";
import { describeAgent, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_app/settings/sessions")({
	head: () => ({ meta: [{ title: "Sessions — HessianLabs" }] }),
	component: SessionsPage,
});

function SessionsPage() {
	const queryClient = useQueryClient();
	const { data: current } = authClient.useSession();
	const sessions = useQuery({
		queryKey: ["auth", "sessions"],
		queryFn: () => unwrap(authClient.listSessions()),
	});
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });

	const revoke = useMutation({
		mutationFn: (token: string) => unwrap(authClient.revokeSession({ token })),
		onSuccess: refresh,
		onError: (e) => toast.error(e.message),
	});
	const revokeOthers = useMutation({
		mutationFn: () => unwrap(authClient.revokeOtherSessions()),
		onSuccess: () => {
			toast.success("Signed out everywhere else");
			refresh();
		},
		onError: (e) => toast.error(e.message),
	});

	const currentToken = current?.session.token;
	// This device first, then the most recent sign-ins.
	const list = [...(sessions.data ?? [])].sort(
		(a, b) =>
			Number(b.token === currentToken) - Number(a.token === currentToken) ||
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	return (
		<>
			<PageHeader
				title="Sessions"
				description="Browsers and devices signed in to your account. Sign out any you don't recognize, then change your password."
				actions={
					list.length > 1 && (
						<Button
							variant="outline"
							disabled={revokeOthers.isPending}
							onClick={() => revokeOthers.mutate()}
						>
							Sign out everywhere else
						</Button>
					)
				}
			/>
			<div className="max-w-3xl">
				<Panel>
					<ul className="divide-y">
						{list.map((s) => (
							<li key={s.id} className="flex items-center gap-4 px-4 py-3">
								<div className="min-w-0 flex-1">
									<p className="flex items-center gap-2 font-medium text-[13px]">
										{describeAgent(s.userAgent)}
										{s.token === currentToken && (
											<Badge variant="signal">this device</Badge>
										)}
									</p>
									<p className="truncate font-mono text-[11px] text-muted-foreground">
										{s.ipAddress || "unknown IP"} · signed in{" "}
										{timeAgo(s.createdAt)}
									</p>
								</div>
								{s.token !== currentToken && (
									<Button
										variant="ghost"
										size="xs"
										className="text-destructive"
										disabled={revoke.isPending}
										onClick={() => revoke.mutate(s.token)}
									>
										Sign out
									</Button>
								)}
							</li>
						))}
					</ul>
				</Panel>
			</div>
		</>
	);
}
