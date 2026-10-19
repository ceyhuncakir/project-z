import type { Context as ApiContext } from "@switchyard/api/context";
import { verifyApiKey } from "@switchyard/api/services/api-keys";
import type { Context as HonoContext } from "hono";

import { auth, services } from "./services";

export function bearerToken(header: string | undefined): string | null {
	const match = header?.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() ?? null;
}

export async function createContext({
	context,
}: {
	context: HonoContext;
}): Promise<ApiContext> {
	const token = bearerToken(context.req.header("authorization"));
	const apiKey = token ? await verifyApiKey(services.db, token) : null;
	const session = apiKey
		? null
		: await auth.api.getSession({ headers: context.req.raw.headers });
	return { ...services, session, apiKey };
}
