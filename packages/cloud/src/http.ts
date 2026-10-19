import { ProviderError, type ProviderId } from "./types";

export interface JsonRequest {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	path: string;
	query?: Record<string, string | number | undefined>;
	body?: unknown;
	headers?: Record<string, string>;
}

const RETRYABLE_STATUS = new Set([408, 409, 423, 425, 429, 500, 502, 503, 504]);

/**
 * Minimal JSON client shared by the live adapters. Maps HTTP failures onto
 * ProviderError so the router can decide whether to fall back.
 */
export function createJsonClient(
	provider: ProviderId,
	baseUrl: string,
	defaultHeaders: () =>
		| Record<string, string>
		| Promise<Record<string, string>>,
	fetchImpl: typeof fetch = fetch,
) {
	return async function request<T = unknown>(req: JsonRequest): Promise<T> {
		const url = new URL(baseUrl.replace(/\/$/, "") + req.path);
		for (const [k, v] of Object.entries(req.query ?? {})) {
			if (v !== undefined) url.searchParams.set(k, String(v));
		}
		const body = req.body === undefined ? undefined : JSON.stringify(req.body);
		let res: Response;
		try {
			res = await fetchImpl(url, {
				method: req.method ?? "GET",
				headers: {
					Accept: "application/json",
					...(body ? { "Content-Type": "application/json" } : {}),
					...(await defaultHeaders()),
					...req.headers,
				},
				body,
				signal: AbortSignal.timeout(30_000),
			});
		} catch (err) {
			throw new ProviderError(
				provider,
				`network error: ${(err as Error).message}`,
				{
					retryable: true,
				},
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
		return (text ? JSON.parse(text) : undefined) as T;
	};
}

export type JsonClient = ReturnType<typeof createJsonClient>;
