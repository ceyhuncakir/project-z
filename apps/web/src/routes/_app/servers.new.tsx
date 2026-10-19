import { Button } from "@switchyard/ui/components/button";
import { Checkbox } from "@switchyard/ui/components/checkbox";
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
import { NativeSelect } from "@switchyard/ui/components/native-select";
import { Textarea } from "@switchyard/ui/components/textarea";
import { cn } from "@switchyard/ui/lib/utils";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, ShuffleIcon, TableIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader, Panel, useOverview } from "@/components/app/app-shell";
import {
	CatalogFilters,
	type CatalogSearch,
	CONTINENT_OPTIONS,
	toFilters,
} from "@/components/catalog/filters";
import { PlanTable } from "@/components/catalog/plan-table";
import { CopyButton } from "@/components/copy-button";
import { flag, formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/servers/new")({
	validateSearch: z.object({ planId: z.string().optional() }),
	head: () => ({ meta: [{ title: "New server — Switchyard" }] }),
	component: NewServerPage,
});

type Mode = "auto" | "plan";

interface Requirements {
	minVcpu?: number;
	minMemoryGb?: number;
	minDiskGb?: number;
	maxHourlyUsd?: number;
	continents: string[];
	cpuType?: "shared" | "dedicated";
}

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-[12.5px]">{label}</Label>
			{children}
			{hint && <p className="text-[11.5px] text-muted-foreground">{hint}</p>}
		</div>
	);
}

function NewServerPage() {
	const { planId: initialPlanId } = Route.useSearch();
	const navigate = useNavigate();
	const [mode, setMode] = useState<Mode>(initialPlanId ? "plan" : "auto");
	const [req, setReq] = useState<Requirements>({
		minVcpu: 2,
		minMemoryGb: 4,
		continents: [],
	});
	const [filters, setFilters] = useState<CatalogSearch>(() =>
		initialPlanId ? { providers: [initialPlanId.split(":")[0] as never] } : {},
	);
	const [planId, setPlanId] = useState<string | undefined>(initialPlanId);
	const [regionId, setRegionId] = useState<string>("");
	const [image, setImage] = useState("ubuntu-24.04");
	const [name, setName] = useState("");
	const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
	const [pastedKey, setPastedKey] = useState("");
	const [userData, setUserData] = useState("");
	const [secret, setSecret] = useState<{
		serverId: string;
		privateKey: string;
	} | null>(null);

	const overview = useOverview();
	const savedKeys = useQuery(orpc.sshKeys.list.queryOptions());
	const images = useQuery(orpc.catalog.images.queryOptions());

	const autoFilters = {
		minVcpu: req.minVcpu,
		minMemoryGb: req.minMemoryGb,
		minDiskGb: req.minDiskGb,
		maxHourlyUsd: req.maxHourlyUsd,
		cpuType: req.cpuType,
		continents: req.continents.length
			? (req.continents as CatalogSearch["continents"])
			: undefined,
	};
	const preview = useQuery(
		orpc.catalog.route.queryOptions({
			input: { filters: autoFilters },
			enabled: mode === "auto",
			placeholderData: keepPreviousData,
		}),
	);
	const plans = useQuery(
		orpc.catalog.plans.queryOptions({
			input: {
				filters: toFilters(filters),
				sort: filters.sort ?? "price",
				limit: 500,
			},
			enabled: mode === "plan",
			placeholderData: keepPreviousData,
		}),
	);
	const selected = plans.data?.plans.find((p) => p.id === planId);

	// Default to every saved key once they load.
	useEffect(() => {
		if (savedKeys.data && selectedKeys === null)
			setSelectedKeys(savedKeys.data.map((k) => k.id));
	}, [savedKeys.data, selectedKeys]);

	useEffect(() => {
		if (selected && !selected.regions.some((r) => r.id === regionId))
			setRegionId(selected.regions[0]?.id ?? "");
	}, [selected, regionId]);

	const create = useMutation(
		orpc.servers.create.mutationOptions({
			onSuccess: (res) => {
				toast.success(
					`${res.server.name} is provisioning on ${res.server.providerName}`,
				);
				if (res.ssh.privateKey)
					setSecret({
						serverId: res.server.id,
						privateKey: res.ssh.privateKey,
					});
				else
					navigate({
						to: "/servers/$serverId",
						params: { serverId: res.server.id },
					});
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	const estimate = mode === "auto" ? preview.data?.[0] : selected;
	const balance = overview.data?.balanceMicros ?? 0;
	const affordable = estimate ? balance >= estimate.priceHourlyMicros : true;
	const canSubmit =
		(mode === "auto" ? Boolean(preview.data?.length) : Boolean(selected)) &&
		affordable;

	function submit() {
		const keys = pastedKey.trim() ? [pastedKey.trim()] : undefined;
		create.mutate({
			name: name.trim() || undefined,
			image: image as "ubuntu-24.04",
			planId: mode === "plan" ? planId : undefined,
			regionId: mode === "plan" ? regionId || undefined : undefined,
			requirements: mode === "auto" ? autoFilters : undefined,
			sshPublicKeys: keys,
			sshKeyIds: selectedKeys ?? undefined,
			userData: userData.trim() || undefined,
		});
	}

	const num = (v: string) => (v === "" ? undefined : Number(v));

	return (
		<>
			<PageHeader
				title="New server"
				description="Describe what you need and let the router pick, or choose an exact plan."
			/>
			<div className="grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
				<div className="min-w-0 space-y-6">
					<div className="grid grid-cols-2 gap-px border bg-border">
						{(
							[
								[
									"auto",
									ShuffleIcon,
									"Auto-route",
									"Cheapest plan that fits, with fallback",
								],
								[
									"plan",
									TableIcon,
									"Choose a plan",
									"Pick provider, plan and region",
								],
							] as const
						).map(([value, Icon, title, body]) => (
							<button
								key={value}
								type="button"
								onClick={() => setMode(value)}
								className={cn(
									"flex items-start gap-3 bg-card p-4 text-left transition-colors hover:bg-muted/40",
									mode === value &&
										"bg-background shadow-[inset_0_-2px_0_0_var(--signal)]",
								)}
							>
								<Icon
									className={cn(
										"mt-0.5 size-4",
										mode === value ? "text-signal" : "text-muted-foreground",
									)}
								/>
								<span>
									<span className="block font-medium text-[13.5px]">
										{title}
									</span>
									<span className="block text-[12px] text-muted-foreground">
										{body}
									</span>
								</span>
							</button>
						))}
					</div>

					{mode === "auto" ? (
						<Panel title="Requirements">
							<div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
								<Field label="Min vCPU">
									<Input
										type="number"
										min={1}
										value={req.minVcpu ?? ""}
										onChange={(e) =>
											setReq({ ...req, minVcpu: num(e.target.value) })
										}
									/>
								</Field>
								<Field label="Min RAM (GB)">
									<Input
										type="number"
										min={0.5}
										step={0.5}
										value={req.minMemoryGb ?? ""}
										onChange={(e) =>
											setReq({ ...req, minMemoryGb: num(e.target.value) })
										}
									/>
								</Field>
								<Field label="Min disk (GB)">
									<Input
										type="number"
										min={10}
										value={req.minDiskGb ?? ""}
										onChange={(e) =>
											setReq({ ...req, minDiskGb: num(e.target.value) })
										}
									/>
								</Field>
								<Field label="Max $ / hour">
									<Input
										type="number"
										min={0}
										step={0.001}
										placeholder="no limit"
										value={req.maxHourlyUsd ?? ""}
										onChange={(e) =>
											setReq({ ...req, maxHourlyUsd: num(e.target.value) })
										}
									/>
								</Field>
							</div>
							<div className="flex flex-wrap items-center gap-1.5 border-t px-4 py-3">
								<span className="label-mono mr-2">Where</span>
								{CONTINENT_OPTIONS.map(([id, label]) => {
									const on = req.continents.includes(id);
									return (
										<button
											key={id}
											type="button"
											aria-pressed={on}
											onClick={() =>
												setReq({
													...req,
													continents: on
														? req.continents.filter((c) => c !== id)
														: [...req.continents, id],
												})
											}
											className={cn(
												"h-7 border px-2.5 font-mono text-[11px]",
												on
													? "border-foreground bg-foreground text-background"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											{label}
										</button>
									);
								})}
								<NativeSelect
									className="ml-auto w-40"
									aria-label="CPU type"
									value={req.cpuType ?? ""}
									onChange={(e) =>
										setReq({
											...req,
											cpuType: (e.target.value ||
												undefined) as Requirements["cpuType"],
										})
									}
								>
									<option value="">Shared or dedicated</option>
									<option value="shared">Shared vCPU</option>
									<option value="dedicated">Dedicated vCPU</option>
								</NativeSelect>
							</div>
							<div className="border-t">
								<p className="label-mono px-4 pt-3">
									Router will try, in order
								</p>
								<ol className="divide-y">
									{preview.data?.map((p, i) => (
										<li
											key={p.id}
											className={cn(
												"grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-[13px]",
												i === 0 && "bg-signal/[0.06]",
											)}
										>
											<span className="font-mono text-[11px] text-muted-foreground">
												{i + 1}
											</span>
											<span className="min-w-0 truncate">
												<span className="font-medium">{p.providerName}</span>{" "}
												<span className="text-muted-foreground">
													{p.name} · {p.vcpu} vCPU · {p.memoryGb} GB ·{" "}
													{flag(p.regions[0]?.country ?? "")}{" "}
													{p.regions[0]?.city}
												</span>
											</span>
											<span className="tabular font-mono">
												{formatUsd(p.priceHourlyMicros, { precise: true })}/h
											</span>
										</li>
									))}
									{preview.data && !preview.data.length && (
										<li className="px-4 py-4 text-muted-foreground text-sm">
											Nothing matches. Loosen a requirement.
										</li>
									)}
								</ol>
							</div>
						</Panel>
					) : (
						<Panel title="Plan">
							<CatalogFilters
								className="border-b p-4"
								value={filters}
								total={plans.data?.total}
								onChange={setFilters}
							/>
							<div className="max-h-[420px] overflow-y-auto">
								<PlanTable
									plans={plans.data?.plans ?? []}
									loading={plans.isPending}
									selectedId={planId}
									onSelect={(p) => setPlanId(p.id)}
								/>
							</div>
							{selected && (
								<div className="flex flex-wrap items-center gap-3 border-t p-4">
									<span className="label-mono">Region</span>
									<NativeSelect
										className="w-64"
										aria-label="Region"
										value={regionId}
										onChange={(e) => setRegionId(e.target.value)}
									>
										{selected.regions.map((r) => (
											<option key={r.id} value={r.id}>
												{flag(r.country)} {r.city} ({r.id})
											</option>
										))}
									</NativeSelect>
								</div>
							)}
						</Panel>
					)}

					<Panel title="System">
						<div className="grid gap-px bg-border sm:grid-cols-4">
							{images.data?.map((img) => (
								<button
									key={img.id}
									type="button"
									onClick={() => setImage(img.id)}
									className={cn(
										"bg-card p-3 text-left transition-colors hover:bg-muted/40",
										image === img.id &&
											"bg-background shadow-[inset_0_-2px_0_0_var(--signal)]",
									)}
								>
									<span className="block font-medium text-[13px]">
										{img.name}
									</span>
									<span className="font-mono text-[10.5px] text-muted-foreground">
										{img.id}
									</span>
								</button>
							))}
						</div>
						<div className="grid gap-4 border-t p-4 sm:grid-cols-2">
							<Field label="Name" hint="Optional. Letters, digits and dashes.">
								<Input
									placeholder="auto"
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
							</Field>
						</div>
					</Panel>

					<Panel title="SSH access">
						<div className="space-y-3 p-4">
							{savedKeys.data?.length ? (
								<div className="space-y-2">
									{savedKeys.data.map((k) => (
										<Label key={k.id} className="text-[13px]">
											<Checkbox
												checked={selectedKeys?.includes(k.id) ?? true}
												onCheckedChange={(on) =>
													setSelectedKeys((cur) =>
														on
															? [...(cur ?? []), k.id]
															: (cur ?? []).filter((id) => id !== k.id),
													)
												}
											/>
											{k.name}
											<span className="font-mono text-[10.5px] text-muted-foreground">
												{k.fingerprint}
											</span>
										</Label>
									))}
								</div>
							) : (
								<p className="text-muted-foreground text-sm">
									No saved keys.{" "}
									<Link
										to="/ssh-keys"
										className="text-foreground underline underline-offset-4"
									>
										Add one
									</Link>
									, paste one below, or leave both empty and we'll generate a
									one-time key.
								</p>
							)}
							<Textarea
								rows={2}
								className="font-mono text-[11.5px]"
								placeholder="ssh-ed25519 AAAA… (optional)"
								value={pastedKey}
								onChange={(e) => setPastedKey(e.target.value)}
							/>
						</div>
						<details className="border-t">
							<summary className="cursor-pointer px-4 py-3 text-[13px] text-muted-foreground hover:text-foreground">
								Advanced: cloud-init user data
							</summary>
							<div className="px-4 pb-4">
								<Textarea
									rows={6}
									className="font-mono text-[11.5px]"
									placeholder={"#cloud-config\npackages:\n  - docker.io"}
									value={userData}
									onChange={(e) => setUserData(e.target.value)}
								/>
							</div>
						</details>
					</Panel>
				</div>

				<aside className="lg:sticky lg:top-20">
					<Panel title="Summary">
						<dl className="divide-y text-[13px]">
							<div className="flex justify-between px-4 py-3">
								<dt className="text-muted-foreground">Plan</dt>
								<dd className="text-right">
									{estimate ? `${estimate.providerName} ${estimate.name}` : "—"}
									{mode === "auto" && estimate && (
										<span className="block font-mono text-[10.5px] text-muted-foreground">
											routed, may fall back
										</span>
									)}
								</dd>
							</div>
							<div className="flex justify-between px-4 py-3">
								<dt className="text-muted-foreground">Per hour</dt>
								<dd className="tabular font-mono">
									{estimate
										? formatUsd(estimate.priceHourlyMicros, { precise: true })
										: "—"}
								</dd>
							</div>
							<div className="flex justify-between px-4 py-3">
								<dt className="text-muted-foreground">Per month</dt>
								<dd className="tabular font-mono text-muted-foreground">
									{estimate ? formatUsd(estimate.priceMonthlyMicros) : "—"}
								</dd>
							</div>
							<div className="flex justify-between px-4 py-3">
								<dt className="text-muted-foreground">Balance</dt>
								<dd
									className={cn(
										"tabular font-mono",
										!affordable && "text-destructive",
									)}
								>
									{formatUsd(balance)}
								</dd>
							</div>
						</dl>
						<div className="space-y-2 border-t p-4">
							<Button
								variant="signal"
								size="xl"
								className="w-full"
								disabled={!canSubmit || create.isPending}
								onClick={submit}
							>
								{create.isPending ? "Provisioning…" : "Create server"}
							</Button>
							{!affordable && (
								<p className="text-[12px] text-destructive">
									You need at least one hour of credit.{" "}
									<Link to="/credits" className="underline underline-offset-4">
										Add credits
									</Link>
								</p>
							)}
							<p className="text-[11.5px] text-muted-foreground">
								Billed per minute, one-hour minimum.
							</p>
						</div>
					</Panel>
				</aside>
			</div>

			<Dialog
				open={Boolean(secret)}
				onOpenChange={(open) => {
					if (!open && secret)
						navigate({
							to: "/servers/$serverId",
							params: { serverId: secret.serverId },
						});
				}}
			>
				<DialogContent className="max-w-xl" showClose={false}>
					<DialogHeader>
						<DialogTitle>Save your private key</DialogTitle>
						<DialogDescription>
							No SSH key was provided, so we generated one. It is shown once and
							never stored.
						</DialogDescription>
					</DialogHeader>
					<div className="relative">
						<pre className="max-h-56 overflow-auto border bg-card p-3 font-mono text-[11px]">
							{secret?.privateKey}
						</pre>
						<CopyButton
							value={secret?.privateKey ?? ""}
							className="absolute top-1.5 right-1.5"
						/>
					</div>
					<p className="font-mono text-[11.5px] text-muted-foreground">
						chmod 600 switchyard-key && ssh -i switchyard-key root@&lt;ip&gt;
					</p>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								if (!secret) return;
								const url = URL.createObjectURL(
									new Blob([secret.privateKey], { type: "text/plain" }),
								);
								const a = Object.assign(document.createElement("a"), {
									href: url,
									download: "switchyard-key",
								});
								a.click();
								URL.revokeObjectURL(url);
							}}
						>
							<DownloadIcon /> Download
						</Button>
						<Button
							variant="signal"
							onClick={() =>
								secret &&
								navigate({
									to: "/servers/$serverId",
									params: { serverId: secret.serverId },
								})
							}
						>
							I saved it
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
