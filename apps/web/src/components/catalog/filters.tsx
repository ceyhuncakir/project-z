import { NativeSelect } from "@switchyard/ui/components/native-select";
import { cn } from "@switchyard/ui/lib/utils";
import { z } from "zod";

export const PROVIDER_OPTIONS = [
	["hetzner", "Hetzner"],
	["digitalocean", "DigitalOcean"],
	["vultr", "Vultr"],
	["linode", "Linode"],
	["ovhcloud", "OVHcloud"],
	["scaleway", "Scaleway"],
] as const;

export const CONTINENT_OPTIONS = [
	["EU", "Europe"],
	["NA", "N. America"],
	["SA", "S. America"],
	["AS", "Asia"],
	["OC", "Oceania"],
	["AF", "Africa"],
] as const;

type ProviderId = (typeof PROVIDER_OPTIONS)[number][0];
type ContinentId = (typeof CONTINENT_OPTIONS)[number][0];

export const catalogSearchSchema = z.object({
	providers: z
		.array(
			z.enum(
				PROVIDER_OPTIONS.map(([id]) => id) as [ProviderId, ...ProviderId[]],
			),
		)
		.optional(),
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
	maxHourlyUsd: z.coerce.number().optional(),
	sort: z.enum(["price", "vcpu", "memory"]).optional(),
});

export type CatalogSearch = z.infer<typeof catalogSearchSchema>;

export function toFilters(s: CatalogSearch) {
	return {
		providers: s.providers?.length ? s.providers : undefined,
		continents: s.continents?.length ? s.continents : undefined,
		minVcpu: s.minVcpu,
		minMemoryGb: s.minMemoryGb,
		cpuType: s.cpuType,
		arch: s.arch,
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
}: {
	active: boolean;
	children: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"h-7 border px-2.5 font-mono text-[11px] transition-colors",
				active
					? "border-foreground bg-foreground text-background"
					: "bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

export function CatalogFilters({
	value,
	onChange,
	total,
	className,
}: {
	value: CatalogSearch;
	onChange: (next: CatalogSearch) => void;
	total?: number;
	className?: string;
}) {
	const set = (patch: Partial<CatalogSearch>) =>
		onChange({ ...value, ...patch });
	const num = (v: string) => (v ? Number(v) : undefined);

	return (
		<div className={cn("space-y-3", className)}>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="label-mono mr-2 w-20">Provider</span>
				{PROVIDER_OPTIONS.map(([id, label]) => (
					<Chip
						key={id}
						active={Boolean(value.providers?.includes(id))}
						onClick={() => set({ providers: toggle(value.providers, id) })}
					>
						{label}
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
			<div className="flex flex-wrap items-end gap-2">
				<span className="label-mono mr-2 hidden w-20 self-center sm:block">
					Size
				</span>
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
