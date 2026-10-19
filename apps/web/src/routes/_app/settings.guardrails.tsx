import {
	CONTINENTS,
	type Continent,
	type ProviderId,
} from "@switchyard/cloud/types";
import { Button } from "@switchyard/ui/components/button";
import { Checkbox } from "@switchyard/ui/components/checkbox";
import { Input } from "@switchyard/ui/components/input";
import { Label } from "@switchyard/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	Panel,
	useActiveAccountName,
} from "@/components/app/app-shell";
import { SettingsRow } from "@/components/app/settings";
import { formatUsd } from "@/lib/format";
import { site } from "@/lib/site";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/settings/guardrails")({
	head: () => ({ meta: [{ title: "Guardrails — HessianLabs" }] }),
	component: GuardrailsPage,
});

const CONTINENT_NAMES: Record<Continent, string> = {
	EU: "Europe",
	NA: "North America",
	SA: "South America",
	AS: "Asia",
	OC: "Oceania",
	AF: "Africa",
};

function GuardrailsPage() {
	const accountName = useActiveAccountName({ inSentence: true });
	const guardrails = useQuery(orpc.guardrails.get.queryOptions());
	const meta = useQuery(orpc.meta.queryOptions());
	return (
		<>
			<PageHeader
				title="Guardrails"
				description={`Limits on what API keys and MCP agents can create in ${accountName}. People in the dashboard aren't limited. Leave a field empty for no limit.`}
			/>
			{guardrails.data && meta.data && (
				<div className="max-w-3xl">
					<GuardrailsForm
						current={guardrails.data}
						providers={meta.data.connectableProviders}
					/>
				</div>
			)}
		</>
	);
}

type Current = {
	role?: "owner" | "admin" | "member";
	monthSpentMicros: number;
	monthlySpendLimitMicros: number | null;
	maxServers: number | null;
	maxHourlyPriceMicros: number | null;
	allowedProviders: ProviderId[] | null;
	allowedContinents: Continent[] | null;
	allowGpu: boolean;
	defaultTtlHours: number | null;
	longRunningHours: number | null;
};

const providerName = (id: string) =>
	[...site.cloudProviders, ...site.gpuProviders].find((p) => p.id === id)
		?.name ?? id;

/** Number inputs as strings, so "empty" means "no limit". */
const field = (value: number | null, scale = 1) =>
	value === null ? "" : String(value / scale);
const parse = (value: string) => (value.trim() === "" ? null : Number(value));

function GuardrailsForm({
	current,
	providers,
}: {
	current: Current;
	providers: ProviderId[];
}) {
	const queryClient = useQueryClient();
	const canEdit = current.role === "owner" || current.role === "admin";
	const [monthly, setMonthly] = useState(
		field(current.monthlySpendLimitMicros, 1e6),
	);
	const [maxServers, setMaxServers] = useState(field(current.maxServers));
	const [maxPrice, setMaxPrice] = useState(
		field(current.maxHourlyPriceMicros, 1e6),
	);
	const [allowed, setAllowed] = useState<ProviderId[]>(
		current.allowedProviders ?? [],
	);
	const [continents, setContinents] = useState<Continent[]>(
		current.allowedContinents ?? [],
	);
	const [allowGpu, setAllowGpu] = useState(current.allowGpu);
	const [ttl, setTtl] = useState(field(current.defaultTtlHours));
	const [longRunning, setLongRunning] = useState(
		field(current.longRunningHours),
	);

	const save = useMutation(
		orpc.guardrails.update.mutationOptions({
			onSuccess: () => {
				toast.success("Guardrails saved");
				queryClient.invalidateQueries(orpc.guardrails.get.queryOptions());
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const toggle = <T,>(list: T[], value: T, on: boolean) =>
		on ? [...list, value] : list.filter((x) => x !== value);

	return (
		<form
			className="space-y-6"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate({
					monthlySpendLimitUsd: parse(monthly),
					maxServers: parse(maxServers),
					maxHourlyPriceUsd: parse(maxPrice),
					allowedProviders: allowed.length ? allowed : null,
					allowedContinents: continents.length ? continents : null,
					allowGpu,
					defaultTtlHours: parse(ttl),
					longRunningHours: parse(longRunning),
				});
			}}
		>
			<Panel title="Spending">
				<div className="divide-y">
					<SettingsRow
						label="Monthly limit"
						htmlFor="g-monthly"
						hint={`Estimated provider cost of every server this month. So far: ${formatUsd(current.monthSpentMicros)}.`}
					>
						<Amount
							id="g-monthly"
							unit="USD / month"
							value={monthly}
							onChange={setMonthly}
							disabled={!canEdit}
						/>
					</SettingsRow>
					<SettingsRow
						label="Price per server"
						htmlFor="g-price"
						hint="The most a single server may cost at the provider's list price."
					>
						<Amount
							id="g-price"
							unit="USD / hour"
							step="any"
							value={maxPrice}
							onChange={setMaxPrice}
							disabled={!canEdit}
						/>
					</SettingsRow>
					<SettingsRow
						label="Active servers"
						htmlFor="g-servers"
						hint="Counted across the account, including ones people created."
					>
						<Amount
							id="g-servers"
							unit="servers"
							step="1"
							value={maxServers}
							onChange={setMaxServers}
							disabled={!canEdit}
						/>
					</SettingsRow>
				</div>
			</Panel>

			<Panel title="Where servers can run">
				<div className="divide-y">
					<SettingsRow
						label="Providers"
						hint="None ticked: every connected provider."
					>
						<Checks>
							{providers.map((id) => (
								<Check
									key={id}
									label={providerName(id)}
									checked={allowed.includes(id)}
									disabled={!canEdit}
									onChange={(on) => setAllowed(toggle(allowed, id, on))}
								/>
							))}
						</Checks>
					</SettingsRow>
					<SettingsRow label="Regions" hint="None ticked: anywhere.">
						<Checks>
							{CONTINENTS.map((c) => (
								<Check
									key={c}
									label={CONTINENT_NAMES[c]}
									checked={continents.includes(c)}
									disabled={!canEdit}
									onChange={(on) => setContinents(toggle(continents, c, on))}
								/>
							))}
						</Checks>
					</SettingsRow>
					<SettingsRow
						label="GPU servers"
						hint="GPU plans cost dollars per hour."
					>
						<Check
							label="Agents may create GPU servers"
							checked={allowGpu}
							disabled={!canEdit}
							onChange={setAllowGpu}
						/>
					</SettingsRow>
				</div>
			</Panel>

			<Panel title="Cleaning up">
				<div className="divide-y">
					<SettingsRow
						label="Time limit"
						htmlFor="g-ttl"
						hint="Agent servers are deleted after this long. Agents may ask for less, or extend by up to this much at a time."
					>
						<Amount
							id="g-ttl"
							unit="hours"
							step="1"
							value={ttl}
							onChange={setTtl}
							disabled={!canEdit}
						/>
					</SettingsRow>
					<SettingsRow
						label="Long-running email"
						htmlFor="g-long"
						hint="Owners and admins hear about any server without a time limit that runs longer than this. Empty: never."
					>
						<Amount
							id="g-long"
							unit="hours"
							step="1"
							value={longRunning}
							onChange={setLongRunning}
							disabled={!canEdit}
						/>
					</SettingsRow>
				</div>
			</Panel>

			{canEdit ? (
				<Button type="submit" variant="signal" disabled={save.isPending}>
					Save guardrails
				</Button>
			) : (
				<p className="text-[12.5px] text-muted-foreground">
					Only the account's owner or admins can change guardrails.
				</p>
			)}
		</form>
	);
}

function Amount({
	id,
	unit,
	step = "any",
	value,
	onChange,
	disabled,
}: {
	id: string;
	unit: string;
	step?: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<Input
				id={id}
				type="number"
				min={step === "1" ? 1 : 0.0001}
				step={step}
				placeholder="No limit"
				className="w-36 font-mono"
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value)}
			/>
			<span className="text-[12px] text-muted-foreground">{unit}</span>
		</div>
	);
}

function Checks({ children }: { children: ReactNode }) {
	return <div className="grid gap-2 sm:grid-cols-2">{children}</div>;
}

function Check({
	label,
	checked,
	disabled,
	onChange,
}: {
	label: string;
	checked: boolean;
	disabled: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<Label className="gap-2 font-normal text-[13px]">
			<Checkbox
				checked={checked}
				disabled={disabled}
				onCheckedChange={(on) => onChange(on)}
			/>
			{label}
		</Label>
	);
}
