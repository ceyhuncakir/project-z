import { cn } from "@switchyard/ui/lib/utils";

export type ServerStatus =
	| "provisioning"
	| "running"
	| "stopped"
	| "suspended"
	| "deleting"
	| "deleted"
	| "error"
	| "detached";

const STYLES: Record<ServerStatus, { dot: string; label: string }> = {
	provisioning: { dot: "bg-warn animate-pulse-dot", label: "Provisioning" },
	running: { dot: "bg-go", label: "Running" },
	stopped: { dot: "bg-muted-foreground", label: "Stopped" },
	suspended: { dot: "bg-destructive", label: "Suspended" },
	deleting: { dot: "bg-muted-foreground animate-pulse-dot", label: "Deleting" },
	deleted: { dot: "bg-border", label: "Deleted" },
	error: { dot: "bg-destructive", label: "Failed" },
	detached: { dot: "bg-border", label: "Detached" },
};

export function StatusDot({
	status,
	className,
}: {
	status: ServerStatus;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				STYLES[status].dot,
				className,
			)}
		/>
	);
}

export function StatusLabel({ status }: { status: ServerStatus }) {
	return (
		<span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
			<StatusDot status={status} />
			{STYLES[status].label}
		</span>
	);
}
