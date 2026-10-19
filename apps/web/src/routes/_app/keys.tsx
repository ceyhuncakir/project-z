import { Button } from "@switchyard/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@switchyard/ui/components/dialog";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@switchyard/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/app/app-shell";
import { CopyButton } from "@/components/copy-button";
import { McpSnippets } from "@/components/mcp-snippets";
import { MCP_URL } from "@/lib/api-url";
import { formatUsd, timeAgo } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/keys")({
	head: () => ({ meta: [{ title: "API keys — Switchyard" }] }),
	component: KeysPage,
});

function KeysPage() {
	const queryClient = useQueryClient();
	const keys = useQuery(orpc.apiKeys.list.queryOptions());
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [limit, setLimit] = useState("");
	const [maxServers, setMaxServers] = useState("");
	const [created, setCreated] = useState<string | null>(null);

	const create = useMutation(
		orpc.apiKeys.create.mutationOptions({
			onSuccess: ({ key }) => {
				setCreated(key);
				setOpen(false);
				setName("");
				setLimit("");
				setMaxServers("");
				queryClient.invalidateQueries();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const revoke = useMutation(
		orpc.apiKeys.revoke.mutationOptions({
			onSuccess: () => {
				toast.success("Key revoked");
				queryClient.invalidateQueries();
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	return (
		<>
			<PageHeader
				title="API keys"
				description="Keys authenticate agents (MCP) and scripts (REST). Give each agent its own key and budget."
				actions={
					<Button variant="signal" onClick={() => setOpen(true)}>
						<PlusIcon /> Create key
					</Button>
				}
			/>

			{created && (
				<Panel title="New key — copy it now" className="mb-6 border-signal/50">
					<div className="space-y-4 p-4">
						<div className="flex items-center gap-2 border bg-background px-3 py-2 font-mono text-[12.5px]">
							<span className="min-w-0 flex-1 truncate">{created}</span>
							<CopyButton value={created} label="Copy key" />
						</div>
						<p className="text-[12.5px] text-muted-foreground">
							This is the only time the key is shown. Paste a config below into
							your agent:
						</p>
						<McpSnippets mcpUrl={MCP_URL} apiKey={created} />
						<Button
							variant="outline"
							size="sm"
							onClick={() => setCreated(null)}
						>
							Done
						</Button>
					</div>
				</Panel>
			)}

			<Panel title="Active keys">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead>Name</TableHead>
							<TableHead>Key</TableHead>
							<TableHead>Spend</TableHead>
							<TableHead>Max servers</TableHead>
							<TableHead>Last used</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{keys.data?.map((k) => {
							const pct = k.spendLimitMicros
								? Math.min(100, (k.spentMicros / k.spendLimitMicros) * 100)
								: 0;
							return (
								<TableRow key={k.id}>
									<TableCell className="font-medium text-[13px]">
										{k.name}
									</TableCell>
									<TableCell className="font-mono text-[12px] text-muted-foreground">
										{k.prefix}…
									</TableCell>
									<TableCell className="min-w-44">
										<div className="tabular font-mono text-[12px]">
											{formatUsd(k.spentMicros)}
											<span className="text-muted-foreground">
												{" "}
												/{" "}
												{k.spendLimitMicros
													? formatUsd(k.spendLimitMicros)
													: "no limit"}
											</span>
										</div>
										{k.spendLimitMicros !== null && (
											<div className="mt-1 h-1 w-full bg-muted">
												<div
													className={
														pct >= 90
															? "h-full bg-destructive"
															: "h-full bg-signal"
													}
													style={{ width: `${pct}%` }}
												/>
											</div>
										)}
									</TableCell>
									<TableCell className="font-mono text-[12px]">
										{k.maxServers ?? "—"}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never"}
									</TableCell>
									<TableCell className="text-right">
										<Button
											variant="ghost"
											size="xs"
											className="text-destructive"
											onClick={() => {
												if (
													confirm(
														`Revoke "${k.name}"? Agents using it will lose access immediately.`,
													)
												)
													revoke.mutate({ id: k.id });
											}}
										>
											Revoke
										</Button>
									</TableCell>
								</TableRow>
							);
						})}
						{keys.data?.length === 0 && (
							<TableRow className="hover:bg-transparent">
								<TableCell
									colSpan={6}
									className="py-12 text-center text-muted-foreground text-sm"
								>
									No keys yet. Create one to connect an agent.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</Panel>

			<Panel title="Connect" className="mt-6">
				<div className="space-y-3 p-4">
					<p className="text-[13px] text-muted-foreground">
						MCP endpoint{" "}
						<code className="font-mono text-foreground">{MCP_URL}</code> ·
						Streamable HTTP · bearer auth
					</p>
					<McpSnippets mcpUrl={MCP_URL} />
				</div>
			</Panel>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<form
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							create.mutate({
								name: name.trim(),
								spendLimitUsd: limit ? Number(limit) : null,
								maxServers: maxServers ? Number(maxServers) : null,
							});
						}}
					>
						<DialogHeader>
							<DialogTitle>Create API key</DialogTitle>
							<DialogDescription>
								Limits apply to servers created with this key.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-1.5">
							<Label htmlFor="key-name">Name</Label>
							<Input
								id="key-name"
								required
								placeholder="claude-code-laptop"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="key-limit">Spend limit (USD)</Label>
								<Input
									id="key-limit"
									type="number"
									min={1}
									step="any"
									placeholder="no limit"
									value={limit}
									onChange={(e) => setLimit(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="key-max">Max servers</Label>
								<Input
									id="key-max"
									type="number"
									min={1}
									placeholder="no limit"
									value={maxServers}
									onChange={(e) => setMaxServers(e.target.value)}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="submit"
								variant="signal"
								disabled={!name.trim() || create.isPending}
							>
								{create.isPending ? "Creating…" : "Create key"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
