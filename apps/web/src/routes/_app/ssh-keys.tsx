import { Button } from "@switchyard/ui/components/button";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { Textarea } from "@switchyard/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/app/app-shell";
import { timeAgo } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/ssh-keys")({
	head: () => ({ meta: [{ title: "SSH keys — Switchyard" }] }),
	component: SshKeysPage,
});

function SshKeysPage() {
	const queryClient = useQueryClient();
	const keys = useQuery(orpc.sshKeys.list.queryOptions());
	const [name, setName] = useState("");
	const [publicKey, setPublicKey] = useState("");

	const add = useMutation(
		orpc.sshKeys.add.mutationOptions({
			onSuccess: () => {
				toast.success("Key added");
				setName("");
				setPublicKey("");
				queryClient.invalidateQueries();
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const remove = useMutation(
		orpc.sshKeys.delete.mutationOptions({
			onSuccess: () => queryClient.invalidateQueries(),
			onError: (e) => toast.error(e.message),
		}),
	);

	return (
		<>
			<PageHeader
				title="SSH keys"
				description="Saved keys are installed for root on every new server (via cloud-init) unless a request passes its own."
			/>
			<div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
				<Panel title="Saved keys">
					<ul className="divide-y">
						{keys.data?.map((k) => (
							<li key={k.id} className="flex items-center gap-4 px-4 py-3">
								<div className="min-w-0 flex-1">
									<p className="font-medium text-[13px]">{k.name}</p>
									<p className="truncate font-mono text-[11px] text-muted-foreground">
										{k.fingerprint} · added {timeAgo(k.createdAt)}
									</p>
								</div>
								<Button
									variant="ghost"
									size="xs"
									className="text-destructive"
									onClick={() => remove.mutate({ id: k.id })}
								>
									Remove
								</Button>
							</li>
						))}
						{keys.data?.length === 0 && (
							<li className="px-4 py-10 text-center text-muted-foreground text-sm">
								No keys yet. Without one, each server gets a one-time generated
								key.
							</li>
						)}
					</ul>
				</Panel>
				<Panel title="Add a key">
					<form
						className="space-y-3 p-4"
						onSubmit={(e) => {
							e.preventDefault();
							add.mutate({ name: name.trim(), publicKey: publicKey.trim() });
						}}
					>
						<div className="space-y-1.5">
							<Label htmlFor="ssh-name">Name</Label>
							<Input
								id="ssh-name"
								required
								placeholder="laptop"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="ssh-key">Public key</Label>
							<Textarea
								id="ssh-key"
								required
								rows={5}
								className="font-mono text-[11px]"
								placeholder="ssh-ed25519 AAAAC3Nza… you@host"
								value={publicKey}
								onChange={(e) => setPublicKey(e.target.value)}
							/>
							<p className="text-[11.5px] text-muted-foreground">
								Usually <code className="font-mono">~/.ssh/id_ed25519.pub</code>
							</p>
						</div>
						<Button
							type="submit"
							variant="signal"
							className="w-full"
							disabled={add.isPending}
						>
							Add key
						</Button>
					</form>
				</Panel>
			</div>
		</>
	);
}
