import { type Executor, newId } from "@switchyard/db";
import {
	apiKey,
	creditTransaction,
	server,
	wallet,
} from "@switchyard/db/schema/app";
import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";

import type { Services } from "../context";

type ServerRow = typeof server.$inferSelect;

const MINUTE = 60_000;

const startOfHour = (d: Date) => {
	const h = new Date(d);
	h.setUTCMinutes(0, 0, 0);
	return h;
};

/**
 * Charges a server's usage from `billedUntil` up to `until`.
 *
 * Usage accrues per whole minute. When `finalize` is set (the server is being
 * destroyed) the trailing partial minute is billed too, and the one-hour
 * minimum is topped up — providers bill at least an hour per server.
 *
 * Optimistic on `billed_until`, so concurrent workers can never double-bill.
 * Returns the amount charged in micro-USD, or null if another writer billed
 * this server first (reload the row and retry if the charge must happen).
 */
export async function chargeUsage(
	db: Executor,
	srv: ServerRow,
	until: Date,
	opts: { finalize?: boolean } = {},
): Promise<number | null> {
	const from = srv.billedUntil;
	if (!from) return 0;
	const elapsed = until.getTime() - from.getTime();
	const minutes = opts.finalize
		? Math.ceil(elapsed / MINUTE)
		: Math.floor(elapsed / MINUTE);
	let amount =
		minutes > 0 ? Math.ceil((srv.priceHourlyMicros * minutes) / 60) : 0;
	if (opts.finalize) {
		amount += Math.max(
			0,
			srv.priceHourlyMicros - (srv.totalCostMicros + amount),
		);
	}
	if (amount <= 0) return 0;
	const billedUntil = new Date(from.getTime() + Math.max(minutes, 0) * MINUTE);

	return db.transaction(async (tx) => {
		const updated = await tx
			.update(server)
			.set({
				billedUntil,
				totalCostMicros: sql`${server.totalCostMicros} + ${amount}`,
			})
			.where(and(eq(server.id, srv.id), eq(server.billedUntil, from)))
			.returning({ id: server.id });
		if (!updated.length) return null;

		await tx
			.insert(creditTransaction)
			.values({
				id: newId("txn"),
				userId: srv.userId,
				kind: "usage",
				amountMicros: -amount,
				description: `${srv.name} · ${srv.planName} · ${srv.provider}`,
				serverId: srv.id,
				periodStart: startOfHour(from),
			})
			.onConflictDoUpdate({
				target: [creditTransaction.serverId, creditTransaction.periodStart],
				set: {
					amountMicros: sql`${creditTransaction.amountMicros} - ${amount}`,
					updatedAt: new Date(),
				},
			});
		await tx
			.update(wallet)
			.set({ balanceMicros: sql`${wallet.balanceMicros} - ${amount}` })
			.where(eq(wallet.userId, srv.userId));
		if (srv.apiKeyId) {
			await tx
				.update(apiKey)
				.set({ spentMicros: sql`${apiKey.spentMicros} + ${amount}` })
				.where(eq(apiKey.id, srv.apiKeyId));
		}
		return amount;
	});
}

/** One metering pass over every billable server. */
export async function meterUsage(svc: Services, now = new Date()) {
	const rows = await svc.db
		.select()
		.from(server)
		.where(
			and(
				isNotNull(server.billedUntil),
				notInArray(server.status, ["deleted", "error"]),
			),
		);
	let total = 0;
	for (const srv of rows) {
		try {
			total += (await chargeUsage(svc.db, srv, now)) ?? 0;
		} catch (err) {
			console.error(`[billing] failed to charge ${srv.id}:`, err);
		}
	}
	return { servers: rows.length, chargedMicros: total };
}

/** Hourly spend of a user's billable servers, in micro-USD. */
export async function burnRate(db: Executor, userId: string): Promise<number> {
	const [row] = await db
		.select({
			total: sql<string>`coalesce(sum(${server.priceHourlyMicros}), 0)`,
		})
		.from(server)
		.where(
			and(
				eq(server.userId, userId),
				isNotNull(server.billedUntil),
				notInArray(server.status, ["deleted", "error"]),
			),
		);
	return Number(row?.total ?? 0);
}
