import type { AppRouterClient } from "@switchyard/api/routers/index";
import { Badge } from "@switchyard/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@switchyard/ui/components/table";
import { Link, useNavigate } from "@tanstack/react-router";

import { flag, formatUsd, timeAgo } from "@/lib/format";

import { CopyButton } from "../copy-button";
import { StatusLabel } from "../status";

export type ServerItem = Awaited<
	ReturnType<AppRouterClient["servers"]["list"]>
>[number];

export function ServerTable({
	servers,
	compact,
}: {
	servers: ServerItem[];
	compact?: boolean;
}) {
	const navigate = useNavigate();
	return (
		<Table>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					<TableHead>Server</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Provider</TableHead>
					{!compact && <TableHead>Location</TableHead>}
					<TableHead>IPv4</TableHead>
					<TableHead className="text-right">Per hour</TableHead>
					{!compact && <TableHead className="text-right">Cost</TableHead>}
					{!compact && <TableHead className="text-right">Created</TableHead>}
				</TableRow>
			</TableHeader>
			<TableBody>
				{servers.map((s) => (
					<TableRow
						key={s.id}
						className="cursor-pointer"
						onClick={(e) => {
							// Buttons and links inside the row handle their own clicks.
							if ((e.target as HTMLElement).closest("button, a")) return;
							navigate({
								to: "/servers/$serverId",
								params: { serverId: s.id },
							});
						}}
					>
						<TableCell>
							<Link
								to="/servers/$serverId"
								params={{ serverId: s.id }}
								className="font-medium text-[13px] hover:underline"
							>
								{s.name}
							</Link>
							<p className="font-mono text-[10.5px] text-muted-foreground">
								{s.planName} · {s.vcpu} vCPU · {s.memoryGb} GB
							</p>
						</TableCell>
						<TableCell>
							<StatusLabel status={s.status} />
						</TableCell>
						<TableCell>
							<span className="inline-flex items-center gap-1.5">
								{s.providerName}
								{s.sandbox && <Badge>sandbox</Badge>}
							</span>
						</TableCell>
						{!compact && (
							<TableCell className="text-muted-foreground">
								{flag(s.country)} {s.city}
							</TableCell>
						)}
						<TableCell>
							{s.ipv4 ? (
								<span className="inline-flex items-center gap-0.5 font-mono text-[12px]">
									{s.ipv4}
									<CopyButton value={s.ipv4} label="Copy IP" />
								</span>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell className="tabular text-right font-mono">
							{formatUsd(s.priceHourlyMicros, { precise: true })}
						</TableCell>
						{!compact && (
							<TableCell className="tabular text-right font-mono">
								{formatUsd(s.totalCostMicros, { precise: true })}
							</TableCell>
						)}
						{!compact && (
							<TableCell className="text-right text-muted-foreground">
								{timeAgo(s.createdAt)}
							</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
