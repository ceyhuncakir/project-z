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
import { NativeSelect } from "@switchyard/ui/components/native-select";
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
import { ProviderLogo } from "@/components/provider-logo";
import { StatusLabel } from "@/components/status";
import { flag, formatUsd, timeAgo } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/servers/$serverId")({
	head: () => ({ meta: [{ title: "Server — HessianLabs" }] }),
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
					`${s.name} deleted · fees ${formatUsd(s.totalFeeMicros, { precise: true })}`,
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
	const live = !["deleted", "error", "detached"].includes(s.status);
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
						<ProviderLogo provider={s.provider} className="size-8" />
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

			{s.status === "detached" && (
				<p className="mb-6 border border-warn/40 bg-warn/10 px-4 py-3 text-[13px]">
					HessianLabs no longer manages this server: its {s.providerName}{" "}
					account was disconnected or stopped accepting the saved credentials.
					If it still exists, it keeps running (and billing) in your{" "}
					{s.providerName} account; manage or delete it there.
				</p>
			)}
			{live && s.expiresAt && (
				<p className="mb-6 border border-warn/40 bg-warn/10 px-4 py-3 text-[13px]">
					Deleted automatically {timeAgo(s.expiresAt)} (
					{new Date(s.expiresAt).toLocaleString()}) unless someone keeps it.
					Change it under Time limit.
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
						<Row label="List price">
							<span className="tabular font-mono">
								{formatUsd(s.priceHourlyMicros, { precise: true })} / hour
							</span>{" "}
							<span className="text-muted-foreground">
								billed by {s.providerName}
							</span>
						</Row>
						<Row label="HessianLabs fee">
							<span className="tabular font-mono">
								{formatUsd(s.feeHourlyMicros, { precise: true })} / hour
							</span>{" "}
							<span className="text-muted-foreground">from your credits</span>
						</Row>
						<Row label="So far">
							<span className="tabular font-mono">
								{formatUsd(s.totalCostMicros, { precise: true })}
							</span>{" "}
							<span className="text-muted-foreground">
								at {s.providerName} (est.) ·{" "}
								<span className="tabular font-mono text-foreground">
									{formatUsd(s.totalFeeMicros, { precise: true })}
								</span>{" "}
								in fees
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
						{live && s.status !== "deleting" && (
							<Row label="Time limit">
								<TimeLimit
									id={s.id}
									expiresAt={s.expiresAt}
									onChanged={refresh}
								/>
							</Row>
						)}
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
						{s.gpu && (
							<Row label="GPU">
								<span className="text-signal">{s.gpu}</span>
							</Row>
						)}
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

const LIMITS = [
	{ hours: 1, label: "1 hour" },
	{ hours: 4, label: "4 hours" },
	{ hours: 24, label: "1 day" },
	{ hours: 72, label: "3 days" },
	{ hours: 168, label: "1 week" },
];

/** Shows when the server deletes itself; set it, move it, or remove it. */
function TimeLimit({
	id,
	expiresAt,
	onChanged,
}: {
	id: string;
	expiresAt: Date | null;
	onChanged: () => void;
}) {
	const keep = useMutation(
		orpc.servers.keep.mutationOptions({
			onSuccess: (s) => {
				toast.success(
					s.expiresAt
						? `${s.name} is deleted ${timeAgo(s.expiresAt)}`
						: `${s.name} has no time limit`,
				);
				onChanged();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className={expiresAt ? "" : "text-muted-foreground"}>
				{expiresAt ? `Deleted ${timeAgo(expiresAt)}` : "None"}
			</span>
			<NativeSelect
				aria-label={expiresAt ? "Move the time limit" : "Set a time limit"}
				className="h-7 w-36 text-[12px]"
				value=""
				disabled={keep.isPending}
				onChange={(e) =>
					e.target.value && keep.mutate({ id, hours: Number(e.target.value) })
				}
			>
				<option value="">{expiresAt ? "Delete in…" : "Set a limit…"}</option>
				{LIMITS.map((l) => (
					<option key={l.hours} value={l.hours}>
						{l.label} from now
					</option>
				))}
			</NativeSelect>
			{expiresAt && (
				<Button
					variant="ghost"
					size="xs"
					disabled={keep.isPending}
					onClick={() => keep.mutate({ id, hours: null })}
				>
					Remove limit
				</Button>
			)}
		</div>
	);
}
