import { NativeSelect } from "@switchyard/ui/components/native-select";
import { cn } from "@switchyard/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { orpc } from "@/utils/orpc";

import { ProviderLogo } from "../provider-logo";

export const CONTINENT_OPTIONS = [
	["EU", "Europe"],
	["NA", "N. America"],
	["SA", "S. America"],
	["AS", "Asia"],
	["OC", "Oceania"],
	["AF", "Africa"],
] as const;

export const GPU_MODEL_OPTIONS = [
	"H200",
	"H100",
	"GH200",
	"A100",
	"L40S",
	"A10",
	"RTX 4090",
	"RTX A6000",
];

type ContinentId = (typeof CONTINENT_OPTIONS)[number][0];

export const catalogSearchSchema = z.object({
	kind: z.enum(["cpu", "gpu", "any"]).optional(),
	providers: z.array(z.string()).optional(),
	continents: z
		.array(
			z.enum(
				CONTINENT_OPTIONS.map(([id]) => id) as [ContinentId, ...ContinentId[]],
			),
		)
		.optional(),
	minVcpu: z.coerce.number().optional(),
	minMemoryGb: z.coerce.number().optional(),
	cpuType: z.enum(["shared", "dedicated"]).optional(),
	arch: z.enum(["x86", "arm"]).optional(),
	gpuModels: z.array(z.string()).optional(),
	minVramGb: z.coerce.number().optional(),
	maxHourlyUsd: z.coerce.number().optional(),
	sort: z.enum(["price", "vcpu", "memory"]).optional(),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

export function toFilters(s: CatalogSearch) {
	const gpu = s.kind === "gpu";
	return {
		kind: s.kind ?? "cpu",
		// Provider ids come from the API's own list, so they are valid enum members.
		providers: s.providers?.length ? (s.providers as never[]) : undefined,
		continents: s.continents?.length ? s.continents : undefined,
		minVcpu: s.minVcpu,
		minMemoryGb: s.minMemoryGb,
		cpuType: gpu ? undefined : s.cpuType,
		arch: gpu ? undefined : s.arch,
		gpuModels: gpu && s.gpuModels?.length ? s.gpuModels : undefined,
		minVramGb: gpu ? s.minVramGb : undefined,
		maxHourlyUsd: s.maxHourlyUsd,
	};
}

function toggle<T>(list: T[] | undefined, value: T): T[] | undefined {
	const next = list?.includes(value)
		? list.filter((v) => v !== value)
		: [...(list ?? []), value];
	return next.length ? next : undefined;
}

function Chip({
	active,
	children,
	onClick,
	title,
}: {
	active: boolean;
	children: React.ReactNode;
	onClick: () => void;
	title?: string;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			title={title}
			className={cn(
				"inline-flex h-7 items-center gap-1.5 border px-2.5 font-mono text-[11px] transition-colors",
				active
					? "border-foreground bg-foreground text-background"
					: "bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

const KINDS = [
	["cpu", "General"],
	["gpu", "GPU"],
	["any", "All"],
] as const;

export function CatalogFilters({
	value,
	onChange,
	total,
	only,
	className,
}: {
	value: CatalogSearch;
	onChange: (next: CatalogSearch) => void;
	total?: number;
	/** Limit the provider chips to these ids (e.g. the user's connected accounts). */
	only?: string[];
	className?: string;
}) {
	const providers = useQuery(orpc.catalog.providers.queryOptions());
	const kind = value.kind ?? "cpu";
	const gpu = kind === "gpu";
	const set = (patch: Partial<CatalogSearch>) =>
		onChange({ ...value, ...patch });
	const num = (v: string) => (v ? Number(v) : undefined);
	const shown = (providers.data ?? []).filter(
		(p) =>
			(kind === "any" ||
				(gpu ? p.category === "gpu" : p.category === "cloud")) &&
			(!only || only.includes(p.id)),
	);

	return (
		<div className={cn("space-y-3", className)}>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="label-mono mr-2 w-20">Type</span>
				<fieldset className="inline-flex border">
					<legend className="sr-only">Plan type</legend>
					{KINDS.map(([id, label]) => (
						<button
							key={id}
							type="button"
							aria-pressed={kind === id}
							// Switching type resets provider/GPU filters that may not apply any more.
							onClick={() =>
								set({
									kind: id,
									providers: undefined,
									gpuModels: undefined,
									minVramGb: undefined,
								})
							}
							className={cn(
								"h-7 px-3 font-mono text-[11px] transition-colors",
								kind === id
									? "bg-foreground text-background"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{label}
						</button>
					))}
				</fieldset>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="label-mono mr-2 w-20">Provider</span>
				{shown.map((p) => (
					<Chip
						key={p.id}
						active={Boolean(value.providers?.includes(p.id))}
						onClick={() => set({ providers: toggle(value.providers, p.id) })}
						title={
							p.preview
								? "Coming soon: accounts can't be connected yet"
								: undefined
						}
					>
						<ProviderLogo provider={p.id} className="-ml-1 size-4" />
						{p.name}
						{p.preview && <span className="text-signal">°</span>}
					</Chip>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="label-mono mr-2 w-20">Location</span>
				{CONTINENT_OPTIONS.map(([id, label]) => (
					<Chip
						key={id}
						active={Boolean(value.continents?.includes(id))}
						onClick={() => set({ continents: toggle(value.continents, id) })}
					>
						{label}
					</Chip>
				))}
			</div>
			{gpu && (
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="label-mono mr-2 w-20">GPU</span>
					{GPU_MODEL_OPTIONS.map((m) => (
						<Chip
							key={m}
							active={Boolean(value.gpuModels?.includes(m))}
							onClick={() => set({ gpuModels: toggle(value.gpuModels, m) })}
						>
							{m}
						</Chip>
					))}
				</div>
			)}
			<div className="flex flex-wrap items-end gap-2">
				<span className="label-mono mr-2 hidden w-20 self-center sm:block">
					Size
				</span>
				{gpu ? (
					<NativeSelect
						aria-label="Minimum GPU memory"
						className="w-40"
						value={value.minVramGb ?? ""}
						onChange={(e) => set({ minVramGb: num(e.target.value) })}
					>
						<option value="">Any VRAM</option>
						{[24, 48, 80, 160, 320, 640].map((n) => (
							<option key={n} value={n}>
								≥ {n} GB VRAM
							</option>
						))}
					</NativeSelect>
				) : (
					<>
						<NativeSelect
							aria-label="Minimum vCPU"
							className="w-32"
							value={value.minVcpu ?? ""}
							onChange={(e) => set({ minVcpu: num(e.target.value) })}
						>
							<option value="">Any vCPU</option>
							{[1, 2, 4, 8, 16].map((n) => (
								<option key={n} value={n}>
									≥ {n} vCPU
								</option>
							))}
						</NativeSelect>
						<NativeSelect
							aria-label="Minimum memory"
							className="w-32"
							value={value.minMemoryGb ?? ""}
							onChange={(e) => set({ minMemoryGb: num(e.target.value) })}
						>
							<option value="">Any RAM</option>
							{[1, 2, 4, 8, 16, 32].map((n) => (
								<option key={n} value={n}>
									≥ {n} GB RAM
								</option>
							))}
						</NativeSelect>
						<NativeSelect
							aria-label="CPU type"
							className="w-32"
							value={value.cpuType ?? ""}
							onChange={(e) =>
								set({
									cpuType: (e.target.value ||
										undefined) as CatalogSearch["cpuType"],
								})
							}
						>
							<option value="">Shared or dedicated</option>
							<option value="shared">Shared vCPU</option>
							<option value="dedicated">Dedicated vCPU</option>
						</NativeSelect>
						<NativeSelect
							aria-label="Architecture"
							className="w-28"
							value={value.arch ?? ""}
							onChange={(e) =>
								set({
									arch: (e.target.value || undefined) as CatalogSearch["arch"],
								})
							}
						>
							<option value="">x86 or Arm</option>
							<option value="x86">x86</option>
							<option value="arm">Arm</option>
						</NativeSelect>
					</>
				)}
				<NativeSelect
					aria-label="Sort"
					className="w-36"
					value={value.sort ?? "price"}
					onChange={(e) =>
						set({ sort: e.target.value as CatalogSearch["sort"] })
					}
				>
					<option value="price">Cheapest first</option>
					<option value="vcpu">Most vCPU</option>
					<option value="memory">Most memory</option>
				</NativeSelect>
				{total !== undefined && (
					<span className="ml-auto self-center font-mono text-[11px] text-muted-foreground">
						{total} plan{total === 1 ? "" : "s"}
					</span>
				)}
			</div>
		</div>
	);
}
