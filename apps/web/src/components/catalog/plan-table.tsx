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
import { cn } from "@switchyard/ui/lib/utils";
import type { ReactNode } from "react";

import { flag, formatUsd } from "@/lib/format";

export type CatalogPlan = Awaited<
	ReturnType<AppRouterClient["catalog"]["plans"]>
>["plans"][number];

export function PlanTable({
	plans,
	loading,
	action,
	selectedId,
	onSelect,
}: {
	plans: CatalogPlan[];
	loading?: boolean;
	action?: (plan: CatalogPlan) => ReactNode;
	selectedId?: string;
	onSelect?: (plan: CatalogPlan) => void;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow className="hover:bg-transparent">
					<TableHead>Plan</TableHead>
					<TableHead className="text-right">vCPU</TableHead>
					<TableHead className="text-right">RAM</TableHead>
					<TableHead className="text-right">Disk</TableHead>
					<TableHead>Compute</TableHead>
					<TableHead>Regions</TableHead>
					<TableHead className="text-right">Per hour</TableHead>
					<TableHead className="text-right">Per month</TableHead>
					{action && <TableHead />}
				</TableRow>
			</TableHeader>
			<TableBody>
				{loading &&
					!plans.length &&
					Array.from({ length: 8 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
						<TableRow key={i}>
							<TableCell colSpan={action ? 9 : 8}>
								<div className="h-4 animate-pulse bg-muted" />
							</TableCell>
						</TableRow>
					))}
				{!loading && !plans.length && (
					<TableRow className="hover:bg-transparent">
						<TableCell
							colSpan={action ? 9 : 8}
							className="py-12 text-center text-muted-foreground text-sm"
						>
							No plan matches these filters.
						</TableCell>
					</TableRow>
				)}
				{plans.map((p) => (
					<TableRow
						key={p.id}
						data-state={selectedId === p.id ? "selected" : undefined}
						onClick={onSelect ? () => onSelect(p) : undefined}
						className={cn(
							onSelect && "cursor-pointer",
							selectedId === p.id && "bg-signal/[0.07]",
						)}
					>
						<TableCell>
							<div className="flex items-center gap-2.5">
								{onSelect && (
									<span
										className={cn(
											"size-3 shrink-0 rounded-full border",
											selectedId === p.id && "border-[4px] border-signal",
										)}
									/>
								)}
								<div>
									<p className="font-medium text-[13px]">{p.name}</p>
									<p className="font-mono text-[10.5px] text-muted-foreground">
										{p.id}
										{p.preview && (
											<span
												className="ml-1.5 text-signal"
												title="Simulated until the live integration ships"
											>
												preview
											</span>
										)}
									</p>
								</div>
							</div>
						</TableCell>
						<TableCell className="tabular text-right font-mono">
							{p.vcpu}
						</TableCell>
						<TableCell className="tabular text-right font-mono">
							{p.memoryGb} GB
						</TableCell>
						<TableCell className="tabular text-right font-mono">
							{p.diskGb} GB
						</TableCell>
						<TableCell>
							{p.gpu ? (
								<div className="flex items-center gap-1.5">
									<Badge variant="signal">
										{p.gpu.count}× {p.gpu.model}
									</Badge>
									<span className="font-mono text-[10.5px] text-muted-foreground">
										{p.gpu.totalVramGb} GB VRAM
									</span>
								</div>
							) : (
								<div className="flex gap-1">
									<Badge
										variant={p.cpuType === "dedicated" ? "outline" : "default"}
									>
										{p.cpuType}
									</Badge>
									{p.arch === "arm" && <Badge variant="signal">arm</Badge>}
								</div>
							)}
						</TableCell>
						<TableCell className="text-muted-foreground">
							<span
								title={p.regions
									.map((r) => `${r.city}, ${r.country}`)
									.join("\n")}
							>
								{[...new Set(p.regions.map((r) => r.country))]
									.slice(0, 5)
									.map(flag)
									.join(" ")}
								<span className="ml-1.5 font-mono text-[10.5px]">
									{p.regions.length}
								</span>
							</span>
						</TableCell>
						<TableCell className="tabular text-right font-mono text-[12.5px]">
							{formatUsd(p.priceHourlyMicros, { precise: true })}
						</TableCell>
						<TableCell className="tabular text-right font-mono text-muted-foreground">
							{formatUsd(p.priceMonthlyMicros)}
						</TableCell>
						{action && (
							<TableCell className="text-right">{action(p)}</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
