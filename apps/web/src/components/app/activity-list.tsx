import type { AppRouterClient } from "@switchyard/api/routers/index";
import { cn } from "@switchyard/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { timeAgo } from "@/lib/format";

export type ActivityItem = Awaited<
	ReturnType<AppRouterClient["activity"]["list"]>
>[number];

const ACTOR_STYLE: Record<string, string> = {
	mcp: "text-signal",
	api: "text-chart-4",
	dashboard: "text-foreground",
	system: "text-warn",
};

export function ActivityList({
	items,
	empty = "Nothing yet.",
}: {
	items: ActivityItem[];
	empty?: string;
}) {
	if (!items.length)
		return (
			<p className="px-4 py-8 text-center text-muted-foreground text-sm">
				{empty}
			</p>
		);
	return (
		<ul className="divide-y">
			{items.map((a) => (
				<li
					key={a.id}
					className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-3 px-4 py-2.5 text-[13px]"
				>
					<span
						className={cn(
							"font-mono text-[10.5px] uppercase",
							ACTOR_STYLE[a.actor],
						)}
					>
						{a.actor}
					</span>
					<span className="min-w-0 truncate">
						{a.serverId ? (
							<Link
								to="/servers/$serverId"
								params={{ serverId: a.serverId }}
								className="hover:underline"
							>
								{a.message}
							</Link>
						) : (
							a.message
						)}
						{/* Teammates' actions say who; the owner's don't need to. */}
						{a.actorName && a.actorUserId !== a.userId && (
							<span className="text-muted-foreground"> · {a.actorName}</span>
						)}
					</span>
					<time
						className="font-mono text-[11px] text-muted-foreground"
						dateTime={String(a.createdAt)}
					>
						{timeAgo(a.createdAt)}
					</time>
				</li>
			))}
		</ul>
	);
}
