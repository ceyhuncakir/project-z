import { ORPCError } from "@orpc/server";
import {
	CREDENTIAL_HINT_FIELD,
	isLiveProvider,
	PROVIDERS,
	ProviderError,
	type ProviderId,
	providerCredentialsSchemas,
} from "@switchyard/cloud";
import { newId } from "@switchyard/db";
import { providerAccount, server } from "@switchyard/db/schema/app";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Actor, Services } from "../context";
import { logActivity } from "./activity";
import {
	isAuthError,
	type ProviderAccountRow,
	sealContext,
} from "./connections";
import { sealCredentials } from "./credentials";
import { detachServers } from "./servers";
import { ACTIVE } from "./statuses";

function serializeAccount(row: ProviderAccountRow, activeServers = 0) {
	return {
		id: row.id,
		provider: row.provider as ProviderId,
		providerName: PROVIDERS[row.provider as ProviderId]?.name ?? row.provider,
		hint: row.hint,
		error: row.error,
		verifiedAt: row.verifiedAt,
		createdAt: row.createdAt,
		activeServers,
	};
}

export async function listProviderAccounts(svc: Services, userId: string) {
	const [rows, counts] = await Promise.all([
		svc.db
			.select()
			.from(providerAccount)
			.where(eq(providerAccount.userId, userId)),
		svc.db
			.select({ id: server.providerAccountId, n: count() })
			.from(server)
			.where(and(eq(server.userId, userId), inArray(server.status, ACTIVE)))
			.groupBy(server.providerAccountId),
	]);
	const active = new Map(counts.map((c) => [c.id, c.n]));
	return rows.map((r) => serializeAccount(r, active.get(r.id) ?? 0));
}

function credentialError(name: string, err: unknown) {
	if (isAuthError(err)) {
		return new ORPCError("BAD_REQUEST", {
			message: `${name} rejected these credentials. Check that they're complete and allowed to manage servers.`,
		});
	}
	const message = err instanceof Error ? err.message : String(err);
	return new ORPCError("BAD_GATEWAY", {
		message: `Couldn't check the credentials with ${name}: ${
			err instanceof ProviderError
				? message.replace(/^\[[^\]]+\] /, "")
				: message
		}`,
	});
}

/**
 * Checks the credentials with the provider, then stores them sealed.
 * Connecting a provider again replaces its credentials; servers created with
 * the old ones stay attached.
 */
export async function connectProviderAccount(
	svc: Services,
	actor: Actor,
	input: { provider: ProviderId; credentials: Record<string, string> },
) {
	const { provider } = input;
	const name = PROVIDERS[provider].name;
	if (!svc.cloud.connectable(provider)) {
		throw new ORPCError("BAD_REQUEST", {
			message: `${name} can't be connected yet.`,
		});
	}
	const schema = isLiveProvider(provider)
		? providerCredentialsSchemas[provider]
		: z.record(z.string(), z.string());
	const parsed = schema.safeParse(input.credentials);
	if (!parsed.success) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Check the ${name} credentials: ${parsed.error.issues
				.map((i) => `${i.path.join(".") || "value"} ${i.message}`)
				.join("; ")}`,
		});
	}
	const credentials = parsed.data as Record<string, string>;
	try {
		await svc.cloud.connect(provider, credentials).verify();
	} catch (err) {
		throw credentialError(name, err);
	}

	const hintField = isLiveProvider(provider)
		? CREDENTIAL_HINT_FIELD[provider]
		: Object.keys(credentials)[0];
	const hint = String(credentials[hintField ?? ""] ?? "").slice(-4);
	const sealed = sealCredentials(
		svc.config.credentialsKey,
		JSON.stringify(credentials),
		sealContext(actor.userId, provider),
	);
	const now = new Date();
	const [row] = await svc.db
		.insert(providerAccount)
		.values({
			id: newId("pa"),
			userId: actor.userId,
			provider,
			credentials: sealed,
			hint,
			verifiedAt: now,
		})
		.onConflictDoUpdate({
			target: [providerAccount.userId, providerAccount.provider],
			set: { credentials: sealed, hint, error: null, verifiedAt: now },
		})
		.returning();
	await logActivity(svc.db, actor, {
		action: "provider.connect",
		message: `Connected ${name} (…${hint})`,
	});
	return serializeAccount(row as ProviderAccountRow);
}

/** Forgets the credentials. The account's servers keep running there, unmanaged and unbilled. */
export async function disconnectProviderAccount(
	svc: Services,
	actor: Actor,
	id: string,
) {
	const [row] = await svc.db
		.select()
		.from(providerAccount)
		.where(
			and(eq(providerAccount.id, id), eq(providerAccount.userId, actor.userId)),
		);
	if (!row) {
		throw new ORPCError("NOT_FOUND", { message: "Account not found" });
	}
	const name = PROVIDERS[row.provider as ProviderId]?.name ?? row.provider;
	const detached = await detachServers(
		svc,
		actor,
		row.id,
		`its ${name} account was disconnected`,
	);
	await svc.db.delete(providerAccount).where(eq(providerAccount.id, row.id));
	await logActivity(svc.db, actor, {
		action: "provider.disconnect",
		message: `Disconnected ${name} (…${row.hint})${
			detached ? `; ${detached} server(s) keep running there, unmanaged` : ""
		}`,
	});
	return { detached };
}
