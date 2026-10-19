import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ActivityList } from "@/components/app/activity-list";
import { PageHeader, Panel } from "@/components/app/app-shell";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/activity")({
	head: () => ({ meta: [{ title: "Activity — HessianLabs" }] }),
	component: ActivityPage,
});

function ActivityPage() {
	const activity = useQuery(
		orpc.activity.list.queryOptions({
			input: { limit: 200 },
			refetchInterval: 10_000,
		}),
	);
	return (
		<>
			<PageHeader
				title="Activity"
				description="Every create, power action and deletion — by you, your agents (mcp), scripts (api) and billing (system)."
			/>
			<Panel title="Log">
				<ActivityList items={activity.data ?? []} empty="No activity yet." />
			</Panel>
		</>
	);
}
