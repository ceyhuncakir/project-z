import { randomBytes } from "node:crypto";

import {
	type Continent,
	ProviderError,
	type ProviderId,
	type ProviderInfo,
	type ProviderServer,
	type Region,
} from "../types";

/** Helpers shared by the live provider adapters. */

export const liveInfo = (info: Omit<ProviderInfo, "mode">): ProviderInfo => ({
	...info,
	mode: "live",
});

/** Currency amount → integer micros. `toFixed` strips float noise (0.01 * 1e6 = 10000.000000000002) before rounding. */
export function toMicros(
	amount: number,
	rounding: "round" | "ceil" = "round",
): number {
	const micros = Number((amount * 1_000_000).toFixed(3));
	return rounding === "ceil" ? Math.ceil(micros) : Math.round(micros);
}

const CONTINENT_COUNTRIES: Record<Continent, string> = {
	EU: "AT BE BG CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LT LU LV MT NL NO PL PT RO RS SE SI SK UA",
	NA: "US CA MX",
	SA: "AR BR CL CO PE UY",
	AS: "AE BH HK ID IL IN JP KR MY PH QA SA SG TH TW VN",
	OC: "AU NZ",
	AF: "EG KE MA NG ZA",
};

const COUNTRY_CONTINENT = new Map(
	Object.entries(CONTINENT_COUNTRIES).flatMap(([continent, list]) =>
		list.split(" ").map((cc) => [cc, continent as Continent] as const),
	),
);

export const continentOf = (country: string): Continent | undefined =>
	COUNTRY_CONTINENT.get(country.toUpperCase());

/** Builds a Region, or undefined when the location can't be placed on a continent. */
export function makeRegion(
	provider: ProviderId,
	slug: string,
	city: string,
	country: string,
	continent: Continent | undefined = continentOf(country),
): Region | undefined {
	if (!country || !continent) return undefined;
	return {
		id: `${provider}:${slug}`,
		provider,
		slug,
		city,
		country: country.toUpperCase(),
		continent,
	};
}

export const isDefined = <T>(v: T | undefined): v is T => v !== undefined;

export const toBase64 = (text: string) =>
	Buffer.from(text, "utf8").toString("base64");

/** ~256 bits of entropy; base64url always mixes upper/lower case and digits. */
export const randomPassword = () => randomBytes(32).toString("base64url");

/** RFC 1123 hostname label (most providers set the machine hostname from the server name). */
export function hostname(name: string, maxLength = 63): string {
	const label = name
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+/, "")
		.slice(0, maxLength)
		.replace(/-+$/, "");
	return label || "server";
}

export const isNotFound = (err: unknown) =>
	err instanceof ProviderError && err.status === 404;

export async function ignoreNotFound(work: Promise<unknown>): Promise<void> {
	try {
		await work;
	} catch (err) {
		if (!isNotFound(err)) throw err;
	}
}

/** A server the provider no longer knows about has been deleted. */
export async function getOrGone(
	providerServerId: string,
	load: () => Promise<ProviderServer>,
): Promise<ProviderServer> {
	try {
		return await load();
	} catch (err) {
		if (isNotFound(err))
			return { providerServerId, status: "deleted", ipv4: null, ipv6: null };
		throw err;
	}
}

const CAPACITY =
	/capacity|unavailable|not available|out[ _-]of[ _-]stock|sold out|shortage|quota|limit|exceeded|insufficient|not enough|placement_error/i;

/**
 * Re-flags create failures that mean "try another plan/provider" (stock,
 * quotas, account limits — often 4xx) as retryable so the router falls back.
 */
export async function capacityAware<T>(
	provider: ProviderId,
	create: () => Promise<T>,
): Promise<T> {
	try {
		return await create();
	} catch (err) {
		if (
			err instanceof ProviderError &&
			!err.retryable &&
			err.status !== 401 &&
			CAPACITY.test(err.message)
		) {
			throw new ProviderError(
				provider,
				err.message.replace(/^\[[^\]]+\] /, ""),
				{
					retryable: true,
					status: err.status,
				},
			);
		}
		throw err;
	}
}

const RETRYABLE_STATUS = new Set([408, 409, 423, 425, 429, 500, 502, 503, 504]);

/** fetch() for requests the JSON client can't express (signed or non-JSON bodies). Same error mapping as http.ts. */
export async function sendRaw(
	provider: ProviderId,
	fetchImpl: typeof fetch,
	url: string | URL,
	init: RequestInit,
): Promise<string> {
	let res: Response;
	try {
		res = await fetchImpl(url, {
			...init,
			signal: AbortSignal.timeout(30_000),
		});
	} catch (err) {
		throw new ProviderError(
			provider,
			`network error: ${(err as Error).message}`,
			{ retryable: true },
		);
	}
	const text = await res.text();
	if (!res.ok) {
		throw new ProviderError(
			provider,
			`HTTP ${res.status}: ${text.slice(0, 500)}`,
			{
				status: res.status,
				retryable:
					RETRYABLE_STATUS.has(res.status) ||
					/capacity|unavailable|sold out|quota/i.test(text),
			},
		);
	}
	return text;
}
