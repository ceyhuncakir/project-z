import { Badge } from "@switchyard/ui/components/badge";
import { Button } from "@switchyard/ui/components/button";
import { Input } from "@switchyard/ui/components/input";
import { NativeSelect } from "@switchyard/ui/components/native-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
	PageHeader,
	Panel,
	useAccounts,
	useActiveAccountName,
} from "@/components/app/app-shell";
import { SettingsRow } from "@/components/app/settings";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/settings/billing")({
	head: () => ({ meta: [{ title: "Billing details — HessianLabs" }] }),
	component: BillingPage,
});

/** ISO 3166-1 alpha-2; names come from the browser. */
const COUNTRY_CODES =
	"AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WS XK YE YT ZA ZM ZW".split(
		" ",
	);

/** Same rule as the API: EU countries share eu_vat; a few others have their own. */
const EU =
	"AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(
		" ",
	);
const takesVat = (country: string) =>
	EU.includes(country) || ["GB", "CH", "NO"].includes(country);

type Details = {
	name: string;
	email: string;
	address: {
		line1: string;
		line2: string;
		city: string;
		postalCode: string;
		state: string;
		country: string;
	};
	taxId: string | null;
	taxIdStatus?: string | null;
};

const EMPTY: Details = {
	name: "",
	email: "",
	address: {
		line1: "",
		line2: "",
		city: "",
		postalCode: "",
		state: "",
		country: "",
	},
	taxId: null,
};

function BillingPage() {
	const accountName = useActiveAccountName({ inSentence: true });
	const billing = useQuery(orpc.credits.billingDetails.queryOptions());
	return (
		<>
			<PageHeader
				title="Billing details"
				description={`What's printed on receipts and invoices for ${accountName}, and where Stripe sends them.`}
			/>
			{billing.data && (
				<div className="max-w-3xl">
					{billing.data.paymentsEnabled ? (
						<BillingForm initial={billing.data.details ?? EMPTY} />
					) : (
						<Panel>
							<p className="px-4 py-10 text-center text-muted-foreground text-sm">
								Card payments aren't set up on this server, so there's nothing
								to invoice.
							</p>
						</Panel>
					)}
				</div>
			)}
		</>
	);
}

function BillingForm({ initial }: { initial: Details }) {
	const queryClient = useQueryClient();
	const role = useAccounts().data?.active.role;
	const canEdit = role === "owner" || role === "admin";
	const [d, setD] = useState<Details>(initial);
	const countries = useMemo(() => {
		const names = new Intl.DisplayNames(["en"], { type: "region" });
		return COUNTRY_CODES.map((code) => ({
			code,
			name: names.of(code) ?? code,
		})).sort((a, b) => a.name.localeCompare(b.name));
	}, []);

	const save = useMutation(
		orpc.credits.updateBillingDetails.mutationOptions({
			onSuccess: (res) => {
				toast.success("Billing details saved");
				if (res.details) setD(res.details);
				queryClient.invalidateQueries(
					orpc.credits.billingDetails.queryOptions(),
				);
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const set = (patch: Partial<Details>) => setD({ ...d, ...patch });
	const setAddress = (patch: Partial<Details["address"]>) =>
		setD({ ...d, address: { ...d.address, ...patch } });
	const vat = takesVat(d.address.country);

	return (
		<form
			className="space-y-6"
			onSubmit={(e) => {
				e.preventDefault();
				save.mutate({
					name: d.name,
					email: d.email,
					address: d.address,
					taxId: vat ? d.taxId?.trim() || null : null,
				});
			}}
		>
			<Panel>
				<fieldset disabled={!canEdit} className="divide-y">
					<SettingsRow
						label="Name on invoices"
						htmlFor="b-name"
						hint="A company, or your own name."
					>
						<Input
							id="b-name"
							autoComplete="organization"
							placeholder="Acme B.V."
							value={d.name}
							onChange={(e) => set({ name: e.target.value })}
						/>
					</SettingsRow>
					<SettingsRow
						label="Billing email"
						htmlFor="b-email"
						hint="Receipts go here."
					>
						<Input
							id="b-email"
							type="email"
							autoComplete="email"
							placeholder="billing@acme.com"
							value={d.email}
							onChange={(e) => set({ email: e.target.value })}
						/>
					</SettingsRow>
					<SettingsRow label="Address" htmlFor="b-line1">
						<div className="space-y-2">
							<Input
								id="b-line1"
								autoComplete="address-line1"
								placeholder="Street and number"
								value={d.address.line1}
								onChange={(e) => setAddress({ line1: e.target.value })}
							/>
							<Input
								aria-label="Address line 2"
								autoComplete="address-line2"
								placeholder="Apartment, suite, floor (optional)"
								value={d.address.line2}
								onChange={(e) => setAddress({ line2: e.target.value })}
							/>
							<div className="grid gap-2 sm:grid-cols-[140px_1fr]">
								<Input
									aria-label="Postal code"
									autoComplete="postal-code"
									placeholder="Postal code"
									value={d.address.postalCode}
									onChange={(e) => setAddress({ postalCode: e.target.value })}
								/>
								<Input
									aria-label="City"
									autoComplete="address-level2"
									placeholder="City"
									value={d.address.city}
									onChange={(e) => setAddress({ city: e.target.value })}
								/>
							</div>
							<div className="grid gap-2 sm:grid-cols-2">
								<Input
									aria-label="State or region"
									autoComplete="address-level1"
									placeholder="State or region (optional)"
									value={d.address.state}
									onChange={(e) => setAddress({ state: e.target.value })}
								/>
								<NativeSelect
									aria-label="Country"
									autoComplete="country"
									value={d.address.country}
									onChange={(e) => setAddress({ country: e.target.value })}
								>
									<option value="">Country</option>
									{countries.map((c) => (
										<option key={c.code} value={c.code}>
											{c.name}
										</option>
									))}
								</NativeSelect>
							</div>
						</div>
					</SettingsRow>
					{vat && (
						<SettingsRow
							label="VAT number"
							htmlFor="b-vat"
							hint="Shown on invoices so you can claim the VAT back. Stripe checks it in the background."
						>
							<div className="flex items-center gap-2">
								<Input
									id="b-vat"
									className="font-mono"
									placeholder={
										d.address.country === "GB"
											? "GB123456789"
											: `${d.address.country}123456789B01`
									}
									value={d.taxId ?? ""}
									onChange={(e) => set({ taxId: e.target.value })}
								/>
								{initial.taxIdStatus && d.taxId === initial.taxId && (
									<Badge
										variant={
											initial.taxIdStatus === "verified"
												? "go"
												: initial.taxIdStatus === "unverified"
													? "warn"
													: "default"
										}
									>
										{initial.taxIdStatus}
									</Badge>
								)}
							</div>
						</SettingsRow>
					)}
				</fieldset>
			</Panel>
			{canEdit ? (
				<Button type="submit" variant="signal" disabled={save.isPending}>
					Save billing details
				</Button>
			) : (
				<p className="text-[12.5px] text-muted-foreground">
					Only the account's owner or admins can change billing details.
				</p>
			)}
		</form>
	);
}
