import { ORPCError } from "@orpc/server";
import {
	type ProviderAdapter,
	ProviderError,
	type ProviderId,
} from "@switchyard/cloud";
import type { Executor } from "@switchyard/db";
import { providerAccount, type server } from "@switchyard/db/schema/app";
import { and, eq, isNull } from "drizzle-orm";

import type { Services } from "../context";
import { openCredentials } from "./credentials";

export type ProviderAccountRow = typeof providerAccount.$inferSelect;

/** Associated data for sealed credentials: they only open for this owner and provider. */
export const sealContext = (userId: string, provider: string) =>
	`${userId}:${provider}`;

export const isAuthError = (err: unknown) =>
	err instanceof ProviderError && (err.status === 401 || err.status === 403);

/** The user's accounts whose credentials currently work, by provider. */
export async function workingAccounts(
	db: Executor,
	userId: string,
): Promise<Map<ProviderId, ProviderAccountRow>> {
	const rows = await db
		.select()
		.from(providerAccount)
		.where(
			and(eq(providerAccount.userId, userId), isNull(providerAccount.error)),
		);
	return new Map(rows.map((r) => [r.provider as ProviderId, r]));
}

export async function loadAccount(db: Executor, id: string) {
	const [row] = await db
		.select()
		.from(providerAccount)
		.where(eq(providerAccount.id, id));
	return row;
}

/** An adapter acting in the account, with its owner's credentials. */
export function accountAdapter(
	svc: Services,
	account: ProviderAccountRow,
): ProviderAdapter {
	const credentials = JSON.parse(
		openCredentials(
			svc.config.credentialsKey,
			account.credentials,
			sealContext(account.userId, account.provider),
		),
	);
	return svc.cloud.connect(account.provider as ProviderId, credentials);
}

/** The adapter for the account a server was created in. */
export async function adapterForServer(
	svc: Services,
	row: typeof server.$inferSelect,
): Promise<ProviderAdapter> {
	const account = row.providerAccountId
		? await loadAccount(svc.db, row.providerAccountId)
		: undefined;
	if (!account) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: `${row.name} is no longer managed by Switchyard: its cloud account was disconnected.`,
		});
	}
	if (account.error) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: `${account.error}. Update the credentials on the Providers page.`,
		});
	}
	return accountAdapter(svc, account);
}
