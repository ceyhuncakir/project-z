import { guardrails, server } from "@switchyard/db/schema/app";
import {
	and,
	inArray,
	isNotNull,
	isNull,
	lte,
	notInArray,
	sql,
} from "drizzle-orm";

import type { Actor, Services } from "../context";
import { DEFAULT_LONG_RUNNING_HOURS } from "./guardrails";
import { notify } from "./notifications";
import { destroyServer } from "./servers";
import { ACTIVE } from "./statuses";

const HOUR = 3_600_000;
/** How long before its time limit a server's owners are warned. */
const WARN_BEFORE_MS = HOUR;

const system = (userId: string): Actor => ({
	userId,
	apiKeyId: null,
	via: "system",
});

const serverUrl = (svc: Services, id: string) =>
	`${svc.config.webUrl}/servers/${id}`;

/**
 * Warns an hour before a server's time limit, then deletes it once the limit
 * passes. Both steps claim the row first, so parallel workers act once.
 */
export async function expireServers(svc: Services, now = new Date()) {
	const warned = await svc.db
		.update(server)
		.set({ expiryWarnedAt: now })
		.where(
			and(
				inArray(server.status, ACTIVE),
				notInArray(server.status, ["deleting"]),
				isNotNull(server.expiresAt),
				isNull(server.expiryWarnedAt),
				lte(server.expiresAt, new Date(now.getTime() + WARN_BEFORE_MS)),
			),
		)
		.returning();
	for (const s of warned) {
		if (s.expiresAt && s.expiresAt <= now) continue; // deleted below; one email is enough
		const minutes = Math.max(
			1,
			Math.round(((s.expiresAt?.getTime() ?? 0) - now.getTime()) / 60_000),
		);
		await notify(svc, s.userId, "serverExpiry", {
			subject: `${s.name} will be deleted in ${minutes} minutes`,
			text: `${s.name} (${s.planName}, ${s.city}) reaches its time limit in ${minutes} minutes and will then be deleted at ${s.provider}, along with its disk.\n\nTo keep it, extend or remove the limit: ${serverUrl(svc, s.id)}`,
		});
	}

	const due = await svc.db
		.select()
		.from(server)
		.where(
			and(
				inArray(server.status, ACTIVE),
				notInArray(server.status, ["deleting"]),
				isNotNull(server.expiresAt),
				lte(server.expiresAt, now),
			),
		);
	let deleted = 0;
	for (const s of due) {
		try {
			await destroyServer(svc, system(s.userId), s, "its time limit ended");
			deleted++;
		} catch (err) {
			// Another worker got there first, or the provider failed: retry next pass.
			console.error(`[expiry] ${s.id}:`, (err as Error).message);
			continue;
		}
		await notify(svc, s.userId, "serverExpiry", {
			subject: `${s.name} was deleted after its time limit`,
			text: `${s.name} (${s.planName}, ${s.city}) reached its time limit and was deleted at ${s.provider}. Its fee has stopped.\n\nDetails: ${serverUrl(svc, s.id)}`,
		});
	}
	return { warned: warned.length, deleted };
}

/**
 * Emails each account once per server that has run longer than the
 * account's threshold without a time limit: agents forget to clean up, and
 * the provider keeps billing. One email per account per pass.
 */
export async function sendLongRunningAlerts(svc: Services, now = new Date()) {
	// No guardrails row means the default; a row with no threshold means never.
	const thresholdHours = sql`(case when exists (select 1 from ${guardrails} where ${guardrails.userId} = ${server.userId}) then (select ${guardrails.longRunningHours} from ${guardrails} where ${guardrails.userId} = ${server.userId}) else ${DEFAULT_LONG_RUNNING_HOURS} end)`;
	const flagged = await svc.db
		.update(server)
		.set({ longRunningNotifiedAt: now })
		.where(
			and(
				inArray(server.status, ACTIVE),
				isNull(server.expiresAt),
				isNull(server.longRunningNotifiedAt),
				sql`${server.createdAt} < ${now}::timestamptz - ${thresholdHours} * interval '1 hour'`,
			),
		)
		.returning();

	const byAccount = new Map<string, typeof flagged>();
	for (const s of flagged) {
		byAccount.set(s.userId, [...(byAccount.get(s.userId) ?? []), s]);
	}
	for (const [accountId, servers] of byAccount) {
		const hours = (s: (typeof servers)[number]) =>
			Math.floor((now.getTime() - s.createdAt.getTime()) / HOUR);
		const list = servers
			.map(
				(s) =>
					`- ${s.name} (${s.planName}, ${s.city}): running for ${hours(s)} hours — ${serverUrl(svc, s.id)}`,
			)
			.join("\n");
		await notify(svc, accountId, "longRunning", {
			subject:
				servers.length === 1
					? `${servers[0]?.name} has been running for ${hours(servers[0] as (typeof servers)[number])} hours`
					: `${servers.length} servers have been running for a while`,
			text: `These servers are still running, and ${servers.length === 1 ? "its provider keeps" : "their providers keep"} billing you for them:\n\n${list}\n\nIf they're forgotten, delete them. To have agents clean up after themselves, set a time limit in Settings → Guardrails: ${svc.config.webUrl}/settings/guardrails`,
		});
	}
	return { alerted: flagged.length };
}
