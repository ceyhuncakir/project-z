import { buttonVariants } from "@switchyard/ui/components/button";
import { Checkbox } from "@switchyard/ui/components/checkbox";
import { Label } from "@switchyard/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { PageHeader, Panel } from "@/components/app/app-shell";
import { ServerTable } from "@/components/app/server-table";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/servers/")({
	head: () => ({ meta: [{ title: "Servers — Switchyard" }] }),
	component: ServersPage,
});

function ServersPage() {
	const [includeDeleted, setIncludeDeleted] = useState(false);
	const servers = useQuery(
		orpc.servers.list.queryOptions({
			input: { includeDeleted },
			refetchInterval: 5_000,
		}),
	);

	return (
		<>
			<PageHeader
				title="Servers"
				description="Everything you and your agents have running, across every provider."
				actions={
					<Link
						to="/servers/new"
						className={buttonVariants({ variant: "outline" })}
					>
						<PlusIcon /> New server
					</Link>
				}
			/>
			<Panel
				title={
					servers.data
						? `${servers.data.length} server${servers.data.length === 1 ? "" : "s"}`
						: "Servers"
				}
				actions={
					<Label className="text-[12px] text-muted-foreground">
						<Checkbox
							checked={includeDeleted}
							onCheckedChange={(v) => setIncludeDeleted(Boolean(v))}
						/>
						Show deleted
					</Label>
				}
			>
				{servers.data?.length ? (
					<ServerTable servers={servers.data} />
				) : (
					<div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
						<p className="font-medium">
							{servers.isPending ? "Loading…" : "No servers yet"}
						</p>
						{!servers.isPending && (
							<>
								<p className="max-w-sm text-muted-foreground text-sm">
									Launch one here, or connect an agent and ask it for one.
								</p>
								<div className="mt-2 flex gap-2">
									<Link
										to="/servers/new"
										className={buttonVariants({ variant: "signal" })}
									>
										New server
									</Link>
									<Link
										to="/keys"
										className={buttonVariants({ variant: "outline" })}
									>
										Connect an agent
									</Link>
								</div>
							</>
						)}
					</div>
				)}
			</Panel>
		</>
	);
}
