import {
	estimateVramGb,
	LLM_PRECISIONS,
	type LlmPrecision,
} from "@switchyard/cloud/llm";
import { Button, buttonVariants } from "@switchyard/ui/components/button";
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
import { ProviderLogo } from "@/components/provider-logo";
import { flag, formatUsd } from "@/lib/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/servers/new")({
	validateSearch: z.object({ planId: z.string().optional() }),
	head: () => ({ meta: [{ title: "New server — HessianLabs" }] }),
	component: NewServerPage,
});

type Mode = "auto" | "plan";

interface Requirements {
	workload: "cpu" | "gpu";
	minVramGb?: number;
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
		workload: "cpu",
		minVramGb: 24,
		minVcpu: 2,
		minMemoryGb: 4,
		continents: [],
	});
	const [filters, setFilters] = useState<CatalogSearch>(() =>
		initialPlanId ? { providers: [initialPlanId.split(":")[0] as never] } : {},
	);
	const [planId, setPlanId] = useState<string | undefined>(initialPlanId);
	const [regionId, setRegionId] = useState<string>("");
	/** null = the default for the plan type (CUDA image on GPU plans). */
	const [image, setImage] = useState<string | null>(null);
	const [llm, setLlm] = useState<{ id: string; precision: LlmPrecision | "" }>({
		id: "",
		precision: "",
	});
	const [name, setName] = useState("");
	/** Hours until it deletes itself; "" for no time limit. */
	const [ttlHours, setTtlHours] = useState("");
	const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
	const [pastedKey, setPastedKey] = useState("");
	const [userData, setUserData] = useState("");
	const [secret, setSecret] = useState<{
		serverId: string;
		privateKey: string;
	} | null>(null);

	const overview = useOverview();
	const meta = useQuery(orpc.meta.queryOptions());
	const accounts = useQuery(orpc.providerAccounts.list.queryOptions());
	const connected = (accounts.data ?? [])
		.filter((a) => !a.error)
		.map((a) => a.provider);
	const savedKeys = useQuery(orpc.sshKeys.list.queryOptions());
	const images = useQuery(orpc.catalog.images.queryOptions());
	const llmModels = useQuery(orpc.catalog.llmModels.queryOptions());

	const gpuAuto = req.workload === "gpu";
	const autoFilters = {
		providers: connected,
		kind: req.workload,
		minVcpu: gpuAuto ? undefined : req.minVcpu,
		minMemoryGb: gpuAuto ? undefined : req.minMemoryGb,
		minDiskGb: req.minDiskGb,
		minVramGb: gpuAuto ? req.minVramGb : undefined,
		maxHourlyUsd: req.maxHourlyUsd,
		cpuType: gpuAuto ? undefined : req.cpuType,
		continents: req.continents.length
			? (req.continents as CatalogSearch["continents"])
			: undefined,
	};
	const preview = useQuery(
		orpc.catalog.route.queryOptions({
			input: { filters: autoFilters },
			enabled: mode === "auto" && connected.length > 0,
			placeholderData: keepPreviousData,
		}),
	);
	// Only plans on connected accounts can be created.
	const planProviders = filters.providers?.length
		? connected.filter((p) => filters.providers?.includes(p))
		: connected;
	const plans = useQuery(
		orpc.catalog.plans.queryOptions({
			input: {
				filters: { ...toFilters(filters), providers: planProviders },
				sort: filters.sort ?? "price",
				limit: 500,
			},
			enabled: mode === "plan" && planProviders.length > 0,
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
	const isGpu = mode === "auto" ? gpuAuto : Boolean(selected?.gpu);
	const effectiveImage =
		image ?? (isGpu ? "ubuntu-22.04-cuda" : "ubuntu-24.04");
	const balance = overview.data?.balanceMicros ?? 0;
	const feeHourly =
		estimate && meta.data
			? Math.ceil((estimate.priceHourlyMicros * meta.data.feePercent) / 100)
			: undefined;
	const affordable = balance > 0 && balance >= (feeHourly ?? 0);
	const canSubmit =
		(mode === "auto" ? Boolean(preview.data?.length) : Boolean(selected)) &&
		affordable;

	function submit() {
		const keys = pastedKey.trim() ? [pastedKey.trim()] : undefined;
		create.mutate({
			name: name.trim() || undefined,
			image: effectiveImage as "ubuntu-24.04",
			planId: mode === "plan" ? planId : undefined,
			regionId: mode === "plan" ? regionId || undefined : undefined,
			requirements: mode === "auto" ? autoFilters : undefined,
			sshPublicKeys: keys,
			sshKeyIds: selectedKeys ?? undefined,
			userData: userData.trim() || undefined,
			ttlHours: ttlHours ? Number(ttlHours) : undefined,
		});
	}

	const num = (v: string) => (v === "" ? undefined : Number(v));

	function sizeFor(id: string, precision: LlmPrecision | "") {
		setLlm({ id, precision });
		const model = llmModels.data?.find((m) => m.id === id);
		if (model) {
			setReq({
				...req,
				minVramGb: estimateVramGb(model.paramsB, precision || model.precision),
			});
		}
	}

	if (accounts.isSuccess && !connected.length) {
		return (
			<>
				<PageHeader title="New server" />
				<Panel title="Connect a cloud account first">
					<div className="flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center">
						<p className="flex-1 text-[13px] text-muted-foreground">
							Servers are created in your own Hetzner, DigitalOcean, Vultr or
							other cloud account, and the provider bills you for them directly.
							Connect at least one account to start.
						</p>
						<Link
							to="/providers"
							className={buttonVariants({ variant: "signal" })}
						>
							Connect an account
						</Link>
					</div>
				</Panel>
			</>
		);
	}

	return (
		<>
			<PageHeader
				title="New server"
				description="Describe what you need and let the router pick from your connected accounts, or choose an exact plan."
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
						<Panel
							title="Requirements"
							actions={
								<fieldset className="inline-flex border">
									<legend className="sr-only">Workload</legend>
									{(
										[
											["cpu", "General compute"],
											["gpu", "GPU / LLM"],
										] as const
									).map(([id, label]) => (
										<button
											key={id}
											type="button"
											aria-pressed={req.workload === id}
											onClick={() => setReq({ ...req, workload: id })}
											className={cn(
												"h-7 px-3 font-mono text-[11px] transition-colors",
												req.workload === id
													? "bg-foreground text-background"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											{label}
										</button>
									))}
								</fieldset>
							}
						>
							{gpuAuto && (
								<div className="grid gap-4 border-b p-4 sm:grid-cols-[1fr_10rem_10rem]">
									<Field
										label="Size for a model"
										hint="Weights × 1.2 for KV cache. Pick a preset or set VRAM yourself."
									>
										<div className="flex gap-2">
											<NativeSelect
												aria-label="Model preset"
												className="flex-1"
												value={llm.id}
												onChange={(e) => sizeFor(e.target.value, llm.precision)}
											>
												<option value="">Choose a model…</option>
												{llmModels.data?.map((m) => (
													<option key={m.id} value={m.id}>
														{m.name} · {m.paramsB}B
													</option>
												))}
											</NativeSelect>
											<NativeSelect
												aria-label="Precision"
												className="w-32"
												value={llm.precision}
												disabled={!llm.id}
												onChange={(e) =>
													sizeFor(llm.id, e.target.value as LlmPrecision | "")
												}
											>
												<option value="">Native</option>
												{(Object.keys(LLM_PRECISIONS) as LlmPrecision[]).map(
													(p) => (
														<option key={p} value={p}>
															{p}
														</option>
													),
												)}
											</NativeSelect>
										</div>
									</Field>
									<Field label="Min VRAM (GB)">
										<Input
											type="number"
											min={8}
											value={req.minVramGb ?? ""}
											onChange={(e) => {
												setLlm({ id: "", precision: "" });
												setReq({ ...req, minVramGb: num(e.target.value) });
											}}
										/>
									</Field>
									<Field label="Max $ / hour">
										<Input
											type="number"
											min={0}
											step={0.01}
											placeholder="no limit"
											value={req.maxHourlyUsd ?? ""}
											onChange={(e) =>
												setReq({ ...req, maxHourlyUsd: num(e.target.value) })
											}
										/>
									</Field>
								</div>
							)}
							<div
								className={cn(
									"grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4",
									gpuAuto && "hidden",
								)}
							>
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
									className={cn("ml-auto w-40", gpuAuto && "hidden")}
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
											<span className="flex min-w-0 items-center gap-2">
												<ProviderLogo
													provider={p.provider}
													className="size-5"
												/>
												<span className="min-w-0 truncate">
													<span className="font-medium">{p.providerName}</span>{" "}
													<span className="text-muted-foreground">
														{p.name} ·{" "}
														{p.gpu
															? `${p.gpu.count}× ${p.gpu.model} · ${p.gpu.totalVramGb} GB VRAM`
															: `${p.vcpu} vCPU · ${p.memoryGb} GB`}{" "}
														· {flag(p.regions[0]?.country ?? "")}{" "}
														{p.regions[0]?.city}
													</span>
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
								total={planProviders.length ? plans.data?.total : 0}
								only={connected}
								onChange={setFilters}
							/>
							<div className="max-h-[420px] overflow-y-auto">
								<PlanTable
									plans={planProviders.length ? (plans.data?.plans ?? []) : []}
									loading={planProviders.length > 0 && plans.isPending}
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
						<div
							className={cn(
								"grid gap-px bg-border",
								isGpu ? "sm:grid-cols-5" : "sm:grid-cols-4",
							)}
						>
							{images.data
								?.filter((img) => isGpu || !img.gpu)
								.map((img) => (
									<button
										key={img.id}
										type="button"
										onClick={() => setImage(img.id)}
										className={cn(
											"bg-card p-3 text-left transition-colors hover:bg-muted/40",
											effectiveImage === img.id &&
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
							<Field
								label="Time limit"
								hint="Deleted automatically after this long, unless someone keeps it."
							>
								<NativeSelect
									aria-label="Time limit"
									value={ttlHours}
									onChange={(e) => setTtlHours(e.target.value)}
								>
									<option value="">None</option>
									<option value="1">1 hour</option>
									<option value="4">4 hours</option>
									<option value="24">1 day</option>
									<option value="72">3 days</option>
									<option value="168">1 week</option>
								</NativeSelect>
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
							<div className="flex justify-between gap-3 px-4 py-3">
								<dt className="text-muted-foreground">
									Provider price
									<span className="block font-mono text-[10.5px]">
										billed to your account
									</span>
								</dt>
								<dd className="tabular text-right font-mono">
									{estimate
										? `${formatUsd(estimate.priceHourlyMicros, { precise: true })}/h`
										: "—"}
									<span className="block text-[10.5px] text-muted-foreground">
										{estimate
											? `${formatUsd(estimate.priceMonthlyMicros)}/mo`
											: ""}
									</span>
								</dd>
							</div>
							<div className="flex justify-between gap-3 px-4 py-3">
								<dt className="text-muted-foreground">
									HessianLabs fee
									<span className="block font-mono text-[10.5px]">
										{meta.data ? `${meta.data.feePercent}%, from credits` : ""}
									</span>
								</dt>
								<dd className="tabular font-mono">
									{feeHourly !== undefined
										? `${formatUsd(feeHourly, { precise: true })}/h`
										: "—"}
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
									Add credits to cover HessianLabs's fee.{" "}
									<Link to="/credits" className="underline underline-offset-4">
										Add credits
									</Link>
								</p>
							)}
							<p className="text-[11.5px] text-muted-foreground">
								The provider bills the server to your account. The fee is
								charged per minute from your credits, one-hour minimum.
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
						chmod 600 hessianlabs-key && ssh -i hessianlabs-key root@&lt;ip&gt;
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
									download: "hessianlabs-key",
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
