import { Badge } from "@switchyard/ui/components/badge";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	PlayIcon,
	RotateCwIcon,
	SquareIcon,
	Trash2Icon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { ActivityList } from "@/components/app/activity-list";
import { Panel } from "@/components/app/app-shell";
import { CopyButton } from "@/components/copy-button";
import { StatusLabel } from "@/components/status";
import { flag, formatUsd, timeAgo } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/servers/$serverId")({
	head: () => ({ meta: [{ title: "Server — Switchyard" }] }),
	component: ServerPage,
});

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[8rem_1fr] items-center gap-3 px-4 py-2.5 text-[13px]">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0">{children}</dd>
		</div>
	);
}

function ServerPage() {
	const { serverId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [confirmText, setConfirmText] = useState("");

	const server = useQuery(
		orpc.servers.get.queryOptions({
			input: { id: serverId },
			refetchInterval: (q) =>
				q.state.data?.status === "provisioning" ? 3_000 : 15_000,
		}),
	);
	const keys = useQuery(orpc.apiKeys.list.queryOptions());
	const activity = useQuery(
		orpc.activity.list.queryOptions({
			input: { serverId, limit: 20 },
			refetchInterval: 10_000,
		}),
	);

	const refresh = () => queryClient.invalidateQueries();
	const action = useMutation(
		orpc.servers.action.mutationOptions({
			onSuccess: (s, vars) => {
				toast.success(`${vars.action} sent to ${s.name}`);
				refresh();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const destroy = useMutation(
		orpc.servers.delete.mutationOptions({
			onSuccess: (s) => {
				toast.success(
					`${s.name} deleted · final cost ${formatUsd(s.totalCostMicros, { precise: true })}`,
				);
				refresh();
				navigate({ to: "/servers" });
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const s = server.data;
	if (server.isError) {
		return (
			<div className="py-16 text-center">
				<p className="text-muted-foreground">Server not found.</p>
				<Link
					to="/servers"
					className="mt-4 inline-block underline underline-offset-4"
				>
					Back to servers
				</Link>
			</div>
		);
	}
	if (!s) return <div className="h-64 animate-pulse border bg-card" />;

	const ssh = s.ipv4 ? `ssh root@${s.ipv4}` : null;
	const live = s.status !== "deleted" && s.status !== "error";
	const busy = action.isPending || destroy.isPending;

	return (
		<>
			<Link
				to="/servers"
				className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
			>
				<ArrowLeftIcon className="size-3.5" /> Servers
			</Link>
			<div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
				<div>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="font-medium text-2xl tracking-tight">{s.name}</h1>
						<StatusLabel status={s.status} />
						{s.sandbox && <Badge variant="warn">sandbox</Badge>}
					</div>
					<p className="mt-1.5 font-mono text-[12px] text-muted-foreground">
						{s.id} · {s.providerName} · {flag(s.country)} {s.city}
					</p>
				</div>
				{live && (
					<div className="flex flex-wrap gap-2">
						{(s.status === "stopped" || s.status === "suspended") && (
							<Button
								variant="outline"
								disabled={busy}
								onClick={() => action.mutate({ id: s.id, action: "start" })}
							>
								<PlayIcon /> Start
							</Button>
						)}
						{s.status === "running" && (
							<>
								<Button
									variant="outline"
									disabled={busy}
									onClick={() => action.mutate({ id: s.id, action: "reboot" })}
								>
									<RotateCwIcon /> Reboot
								</Button>
								<Button
									variant="outline"
									disabled={busy}
									onClick={() => action.mutate({ id: s.id, action: "stop" })}
								>
									<SquareIcon /> Stop
								</Button>
							</>
						)}
						<Button
							variant="destructive"
							disabled={busy}
							onClick={() => setConfirmDelete(true)}
						>
							<Trash2Icon /> Delete
						</Button>
					</div>
				)}
			</div>

			{s.status === "suspended" && (
				<p className="mb-6 border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px]">
					Suspended because your balance reached zero. Add credits and start it
					within 24 hours, or it will be destroyed.
				</p>
			)}
			{s.status === "error" && s.errorMessage && (
				<p className="mb-6 border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-[12px]">
					{s.errorMessage}
				</p>
			)}

			<div className="grid gap-6 lg:grid-cols-2">
				<Panel title="Connect">
					<dl className="divide-y">
						<Row label="IPv4">
							{s.ipv4 ? (
								<span className="inline-flex items-center gap-1 font-mono text-[12.5px]">
									{s.ipv4} <CopyButton value={s.ipv4} />
								</span>
							) : (
								<span className="text-muted-foreground">
									{s.status === "provisioning" ? "Assigning…" : "—"}
								</span>
							)}
						</Row>
						<Row label="IPv6">
							<span className="truncate font-mono text-[12px] text-muted-foreground">
								{s.ipv6 ?? "—"}
							</span>
						</Row>
						<Row label="SSH">
							{ssh ? (
								<span className="inline-flex items-center gap-1 font-mono text-[12.5px]">
									{ssh} <CopyButton value={ssh} />
								</span>
							) : (
								<span className="text-muted-foreground">
									Available once running
								</span>
							)}
						</Row>
					</dl>
				</Panel>
				<Panel title="Billing">
					<dl className="divide-y">
						<Row label="Price">
							<span className="tabular font-mono">
								{formatUsd(s.priceHourlyMicros, { precise: true })} / hour
							</span>
						</Row>
						<Row label="Cost so far">
							<span className="tabular font-mono">
								{formatUsd(s.totalCostMicros, { precise: true })}
							</span>
						</Row>
						<Row label="Created">
							{new Date(s.createdAt).toLocaleString()}{" "}
							<span className="text-muted-foreground">
								({timeAgo(s.createdAt)})
							</span>
						</Row>
						<Row label="Created by">
							{s.apiKeyId ? (
								<span>
									API key{" "}
									<span className="font-mono text-[12px]">
										{keys.data?.find((k) => k.id === s.apiKeyId)?.name ??
											s.apiKeyId}
									</span>
								</span>
							) : (
								"Dashboard"
							)}
						</Row>
					</dl>
				</Panel>
				<Panel title="Specs">
					<dl className="divide-y">
						<Row label="Plan">
							{s.planName}{" "}
							<span className="font-mono text-[11px] text-muted-foreground">
								{s.planId}
							</span>
						</Row>
						<Row label="Resources">
							{s.vcpu} vCPU · {s.memoryGb} GB RAM · {s.diskGb} GB disk
						</Row>
						<Row label="Image">{s.image}</Row>
						<Row label="Region">
							<span className="font-mono text-[12px]">{s.regionId}</span>
						</Row>
					</dl>
				</Panel>
				<Panel title="Activity">
					<ActivityList items={activity.data ?? []} />
				</Panel>
			</div>

			<Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete {s.name}?</DialogTitle>
						<DialogDescription>
							The server and its disk are destroyed at {s.providerName}. This
							cannot be undone. Type the server name to confirm.
						</DialogDescription>
					</DialogHeader>
					<Input
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
						placeholder={s.name}
					/>
					<DialogFooter>
						<DialogClose render={<Button variant="outline" />}>
							Cancel
						</DialogClose>
						<Button
							variant="destructive"
							disabled={confirmText !== s.name || destroy.isPending}
							onClick={() => destroy.mutate({ id: s.id })}
						>
							{destroy.isPending ? "Deleting…" : "Delete server"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
