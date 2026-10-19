import type { Executor } from "@switchyard/db";
import {
	activity,
	apiKey,
	creditTransaction,
	providerAccount,
	server,
	sshKey,
	teamMember,
	wallet,
} from "@switchyard/db/schema/app";
import { session, user } from "@switchyard/db/schema/auth";
import { and, asc, count, eq, inArray } from "drizzle-orm";

import type { Actor, Services } from "../context";
import { serializeApiKey } from "./api-keys";
import { getGuardrails } from "./guardrails";
import { getNotificationSettings } from "./notifications";
import { listSecurityEvents } from "./security";
import { serializeServer } from "./servers";
import { ACTIVE } from "./statuses";
import { listAccounts, listMembers } from "./team";
import { getBalance } from "./wallet";

/**
 * What stops a user from deleting themselves. Deleting removes their own
 * account with it, so it must not strand servers at a provider or pull the
 * floor out from under teammates.
 */
export async function deletionBlockers(db: Executor, userId: string) {
	const [running] = await db
		.select({ n: count() })
		.from(server)
		.where(and(eq(server.userId, userId), inArray(server.status, ACTIVE)));
	const [members] = await db
		.select({ n: count() })
		.from(teamMember)
		.where(eq(teamMember.accountId, userId));
	const blockers: string[] = [];
	if (running?.n) {
		blockers.push(
			`${running.n} server(s) still run in your account. Delete them first: they would keep running, and billing you, at the provider.`,
		);
	}
	if (members?.n) {
		blockers.push(
			`${members.n} teammate(s) still use your account. Remove them in Settings → Team first, since their shared servers and keys would go too.`,
		);
	}
	return blockers;
}

export async function deletionCheck(db: Executor, userId: string) {
	return {
		blockers: await deletionBlockers(db, userId),
		/** Forfeited on deletion. */
		balanceMicros: await getBalance(db, userId),
	};
}

/**
 * Everything stored about the user, and about the account they're acting in
 * when they own or administer it. Secrets never leave: no session tokens,
 * key hashes, passwords or cloud credentials.
 */
export async function exportData(
	svc: Services,
	actor: Actor,
	me: { id: string },
) {
	const db = svc.db;
	const [profile] = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			twoFactorEnabled: user.twoFactorEnabled,
			createdAt: user.createdAt,
		})
		.from(user)
		.where(eq(user.id, me.id));
	const sessions = await db
		.select({
			createdAt: session.createdAt,
			expiresAt: session.expiresAt,
			ipAddress: session.ipAddress,
			userAgent: session.userAgent,
		})
		.from(session)
		.where(eq(session.userId, me.id));

	const personal = {
		profile,
		sessions,
		securityEvents: await listSecurityEvents(db, me.id),
		notificationSettings: await getNotificationSettings(db, me.id),
		accounts: await listAccounts(db, me.id),
	};
	if (actor.role === "member") {
		return { exportedAt: new Date(), ...personal, account: null };
	}

	const accountId = actor.userId;
	const [w] = await db
		.select()
		.from(wallet)
		.where(eq(wallet.userId, accountId));
	return {
		exportedAt: new Date(),
		...personal,
		account: {
			id: accountId,
			wallet: w && {
				balanceMicros: w.balanceMicros,
				card: w.cardLast4 ? { brand: w.cardBrand, last4: w.cardLast4 } : null,
				autoTopupEnabled: w.autoTopupEnabled,
				autoTopupThresholdMicros: w.autoTopupThresholdMicros,
				autoTopupAmountMicros: w.autoTopupAmountMicros,
				lowBalanceThresholdMicros: w.lowBalanceThresholdMicros,
			},
			transactions: await db
				.select()
				.from(creditTransaction)
				.where(eq(creditTransaction.userId, accountId))
				.orderBy(asc(creditTransaction.createdAt)),
			servers: (
				await db
					.select()
					.from(server)
					.where(eq(server.userId, accountId))
					.orderBy(asc(server.createdAt))
			).map(serializeServer),
			activity: await db
				.select()
				.from(activity)
				.where(eq(activity.userId, accountId))
				.orderBy(asc(activity.createdAt)),
			apiKeys: (
				await db.select().from(apiKey).where(eq(apiKey.userId, accountId))
			).map(serializeApiKey),
			sshKeys: await db
				.select({
					name: sshKey.name,
					fingerprint: sshKey.fingerprint,
					publicKey: sshKey.publicKey,
					createdAt: sshKey.createdAt,
				})
				.from(sshKey)
				.where(eq(sshKey.userId, accountId)),
			cloudAccounts: await db
				.select({
					provider: providerAccount.provider,
					hint: providerAccount.hint,
					error: providerAccount.error,
					verifiedAt: providerAccount.verifiedAt,
					createdAt: providerAccount.createdAt,
				})
				.from(providerAccount)
				.where(eq(providerAccount.userId, accountId)),
			guardrails: await getGuardrails(db, accountId),
			team: await listMembers(db, accountId),
		},
	};
}
