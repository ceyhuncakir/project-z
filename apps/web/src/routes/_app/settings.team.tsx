import { Badge } from "@switchyard/ui/components/badge";
import { Button } from "@switchyard/ui/components/button";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { NativeSelect } from "@switchyard/ui/components/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	Panel,
	useActiveAccountName,
} from "@/components/app/app-shell";
import { authClient } from "@/lib/auth-client";
import { timeAgo } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/settings/team")({
	head: () => ({ meta: [{ title: "Team — HessianLabs" }] }),
	component: TeamPage,
});

const ROLES = {
	admin: "Admin: billing, cloud accounts, guardrails and the team",
	member: "Member: servers, API keys and SSH keys",
} as const;

function TeamPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const accountName = useActiveAccountName({ inSentence: true });
	const { data: session } = authClient.useSession();
	const team = useQuery(orpc.team.members.queryOptions());
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<"admin" | "member">("member");
	const [lastLink, setLastLink] = useState<string | null>(null);

	const refresh = () =>
		queryClient.invalidateQueries(orpc.team.members.queryOptions());
	const invite = useMutation(
		orpc.team.invite.mutationOptions({
			onSuccess: (res) => {
				toast.success(`Invitation sent to ${res.email}`);
				setLastLink(res.url);
				setEmail("");
				refresh();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const revoke = useMutation(
		orpc.team.revokeInvitation.mutationOptions({
			onSuccess: refresh,
			onError: (e) => toast.error(e.message),
		}),
	);
	const updateRole = useMutation(
		orpc.team.updateRole.mutationOptions({
			onSuccess: refresh,
			onError: (e) => toast.error(e.message),
		}),
	);
	const remove = useMutation(
		orpc.team.remove.mutationOptions({
			onSuccess: async (_, { id }) => {
				const me = team.data?.members.find((m) => m.id === id)?.userId;
				if (me && me === session?.user.id) {
					// Left: back to your own account.
					toast.success(`You left ${accountName}`);
					await queryClient.invalidateQueries();
					navigate({ to: "/dashboard" });
					return;
				}
				refresh();
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	if (!team.data) return null;
	const { owner, members, invitations } = team.data;
	const manages = team.data.role === "owner" || team.data.role === "admin";

	return (
		<>
			<PageHeader
				title="Team"
				description={`People in ${accountName}. They share its credits, cloud accounts, servers and API keys; each signs in as themselves.`}
			/>
			<div className="max-w-3xl space-y-6">
				<Panel title="Members">
					<ul className="divide-y">
						{owner && (
							<li className="flex items-center gap-4 px-4 py-3">
								<Person name={owner.name} email={owner.email} />
								<Badge variant="signal">owner</Badge>
							</li>
						)}
						{members.map((m) => {
							const isMe = m.userId === session?.user.id;
							return (
								<li
									key={m.id}
									className="flex flex-wrap items-center gap-4 px-4 py-3"
								>
									<Person
										name={isMe ? `${m.name} (you)` : m.name}
										email={m.email}
										hint={`joined ${timeAgo(m.joinedAt)}`}
									/>
									{manages ? (
										<NativeSelect
											aria-label={`Role of ${m.email}`}
											className="w-32"
											value={m.role}
											disabled={updateRole.isPending}
											onChange={(e) =>
												updateRole.mutate({
													id: m.id,
													role: e.target.value as "admin" | "member",
												})
											}
										>
											<option value="member">member</option>
											<option value="admin">admin</option>
										</NativeSelect>
									) : (
										<Badge>{m.role}</Badge>
									)}
									{(manages || isMe) && (
										<Button
											variant="ghost"
											size="xs"
											className="text-destructive"
											disabled={remove.isPending}
											onClick={() => remove.mutate({ id: m.id })}
										>
											{isMe ? "Leave" : "Remove"}
										</Button>
									)}
								</li>
							);
						})}
						{members.length === 0 && (
							<li className="px-4 py-6 text-muted-foreground text-sm">
								Just you so far. Invite teammates below to share this account.
							</li>
						)}
					</ul>
				</Panel>

				{invitations.length > 0 && (
					<Panel title="Waiting to accept">
						<ul className="divide-y">
							{invitations.map((i) => (
								<li key={i.id} className="flex items-center gap-4 px-4 py-3">
									<Person
										name={i.email}
										hint={`${i.role} · expires ${timeAgo(i.expiresAt)}`}
									/>
									{manages && (
										<Button
											variant="ghost"
											size="xs"
											className="text-destructive"
											disabled={revoke.isPending}
											onClick={() => revoke.mutate({ id: i.id })}
										>
											Cancel
										</Button>
									)}
								</li>
							))}
						</ul>
					</Panel>
				)}

				{manages ? (
					<Panel title="Invite someone">
						<form
							className="space-y-3 p-4"
							onSubmit={(e) => {
								e.preventDefault();
								invite.mutate({ email: email.trim(), role });
							}}
						>
							<div className="flex flex-wrap gap-2">
								<div className="min-w-56 flex-1 space-y-1.5">
									<Label htmlFor="invite-email" className="text-[12px]">
										Email
									</Label>
									<Input
										id="invite-email"
										type="email"
										required
										placeholder="teammate@company.com"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="invite-role" className="text-[12px]">
										Role
									</Label>
									<NativeSelect
										id="invite-role"
										className="w-32"
										value={role}
										onChange={(e) =>
											setRole(e.target.value as "admin" | "member")
										}
									>
										<option value="member">member</option>
										<option value="admin">admin</option>
									</NativeSelect>
								</div>
								<Button
									type="submit"
									variant="signal"
									className="self-end"
									disabled={invite.isPending}
								>
									Send invitation
								</Button>
							</div>
							<p className="text-[12px] text-muted-foreground">
								{ROLES[role]}. The link works for 7 days, and only for someone
								signed in with that email.
							</p>
							{lastLink && (
								<p className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
									Or share the link yourself:
									<code className="max-w-full truncate font-mono text-foreground">
										{lastLink}
									</code>
									<Button
										type="button"
										variant="ghost"
										size="xs"
										onClick={async () => {
											await navigator.clipboard.writeText(lastLink);
											toast.success("Copied");
										}}
									>
										Copy
									</Button>
								</p>
							)}
						</form>
					</Panel>
				) : (
					<p className="text-[12.5px] text-muted-foreground">
						You're a member here: you can use servers, API keys and SSH keys.
						The owner or an admin manages billing, cloud accounts, guardrails
						and the team.
					</p>
				)}
			</div>
		</>
	);
}

function Person({
	name,
	email,
	hint,
}: {
	name: string;
	email?: string;
	hint?: string;
}) {
	return (
		<div className="min-w-0 flex-1">
			<p className="truncate font-medium text-[13px]">{name}</p>
			<p className="truncate font-mono text-[11px] text-muted-foreground">
				{[email, hint].filter(Boolean).join(" · ")}
			</p>
		</div>
	);
}
