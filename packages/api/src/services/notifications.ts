import { formatUsd } from "@switchyard/cloud";
import type { Executor } from "@switchyard/db";
import { notificationSettings, wallet } from "@switchyard/db/schema/app";
import { user } from "@switchyard/db/schema/auth";
import { and, eq, gte, lt } from "drizzle-orm";

import type { Services } from "../context";
import { accountRecipients } from "./team";
import { ensureWallet } from "./wallet";

export type NotificationKind =
	| "providerProblems"
	| "autoTopupFailed"
	| "lowBalance"
	| "longRunning"
	| "serverExpiry"
	| "newSignIn";

type Flags = Record<NotificationKind, boolean>;

export async function getNotificationSettings(
	db: Executor,
	userId: string,
): Promise<Flags> {
	const [row] = await db
		.select()
		.from(notificationSettings)
		.where(eq(notificationSettings.userId, userId));
	return {
		providerProblems: row?.providerProblems ?? true,
		autoTopupFailed: row?.autoTopupFailed ?? true,
		lowBalance: row?.lowBalance ?? true,
		longRunning: row?.longRunning ?? true,
		serverExpiry: row?.serverExpiry ?? true,
		newSignIn: row?.newSignIn ?? true,
	};
}

export async function updateNotificationSettings(
	db: Executor,
	userId: string,
	flags: Partial<Flags>,
) {
	await db
		.insert(notificationSettings)
		.values({ userId, ...flags })
		.onConflictDoUpdate({ target: notificationSettings.userId, set: flags });
	return getNotificationSettings(db, userId);
}

/** The account's low-balance threshold, shared by its owner and admins. */
export async function getLowBalanceThreshold(db: Executor, accountId: string) {
	await ensureWallet(db, accountId);
	const [w] = await db
		.select({ micros: wallet.lowBalanceThresholdMicros })
		.from(wallet)
		.where(eq(wallet.userId, accountId));
	return w?.micros ?? 0;
}

export async function setLowBalanceThreshold(
	db: Executor,
	accountId: string,
	usd: number,
) {
	await ensureWallet(db, accountId);
	await db
		.update(wallet)
		.set({ lowBalanceThresholdMicros: Math.round(usd * 1e6) })
		.where(eq(wallet.userId, accountId));
	return getLowBalanceThreshold(db, accountId);
}

const FOOTER = (svc: Services) =>
	`\n\n—\nChoose which emails you get: ${svc.config.webUrl}/settings/notifications`;

/**
 * Emails one person unless they've switched this kind off. Never throws: a
 * mail server problem mustn't break billing, sync or sign-in.
 */
export async function notifyUser(
	svc: Services,
	userId: string,
	kind: NotificationKind,
	email: { subject: string; text: string },
) {
	try {
		const settings = await getNotificationSettings(svc.db, userId);
		if (!settings[kind]) return;
		const [to] = await svc.db
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, userId));
		if (!to) return;
		await svc.mail({
			to: to.email,
			subject: email.subject,
			text: `${email.text}${FOOTER(svc)}`,
		});
	} catch (err) {
		console.error(`[notify] ${kind} for ${userId} failed:`, err);
	}
}

/** Emails the account's owner and admins, each by their own settings. */
export async function notify(
	svc: Services,
	accountId: string,
	kind: NotificationKind,
	email: { subject: string; text: string },
) {
	const recipients = await accountRecipients(svc.db, accountId).catch((err) => {
		console.error(`[notify] recipients for ${accountId} failed:`, err);
		return [accountId];
	});
	for (const userId of recipients) await notifyUser(svc, userId, kind, email);
}

/**
 * Emails accounts whose balance just fell below their threshold. A wallet
 * arms once its balance is at or above the threshold and disarms when the
 * email goes out, so a new account at $0 isn't alerted and each drop emails
 * once. Wallets with auto top-up on are skipped: it refills them, and a
 * failure sends its own email.
 */
export async function sendLowBalanceAlerts(svc: Services) {
	await svc.db
		.update(wallet)
		.set({ lowBalanceAlertArmed: true })
		.where(
			and(
				eq(wallet.lowBalanceAlertArmed, false),
				gte(wallet.balanceMicros, wallet.lowBalanceThresholdMicros),
			),
		);
	const low = await svc.db
		.update(wallet)
		.set({ lowBalanceAlertArmed: false })
		.where(
			and(
				eq(wallet.lowBalanceAlertArmed, true),
				eq(wallet.autoTopupEnabled, false),
				lt(wallet.balanceMicros, wallet.lowBalanceThresholdMicros),
			),
		)
		.returning({ userId: wallet.userId, balanceMicros: wallet.balanceMicros });

	for (const w of low) {
		await notify(svc, w.userId, "lowBalance", {
			subject: `Your HessianLabs balance is ${formatUsd(w.balanceMicros)}`,
			text: `Your balance dropped to ${formatUsd(w.balanceMicros)}. New servers need credit for HessianLabs's fee, so your agents can't create any once it runs out; servers that are already running aren't affected.\n\nAdd credits or turn on auto top-up: ${svc.config.webUrl}/credits`,
		});
	}
	return { alerted: low.length };
}
