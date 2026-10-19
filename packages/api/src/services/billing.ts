import { type Executor, newId } from "@switchyard/db";
import {
	apiKey,
	creditTransaction,
	server,
	wallet,
} from "@switchyard/db/schema/app";
import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";

import type { Services } from "../context";
import { addMonthSpend } from "./guardrails";
import { CLOSED } from "./statuses";

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
 * The provider bills the server to the user directly. Here we only take
 * HessianLabs's fee from the balance, and keep a running estimate of the
 * provider cost at list price (for display and API key spend limits).
 *
 * Usage accrues per whole minute. When `finalize` is set (the server is
 * leaving HessianLabs) the trailing partial minute counts too, and both totals
 * are topped up to the one-hour minimum providers bill per server.
 *
 * Optimistic on `billed_until`, so concurrent workers can never double-bill.
 * Returns the fee charged in micro-USD, or null if another writer billed
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
	const accrued = (hourly: number) =>
		minutes > 0 ? Math.ceil((hourly * minutes) / 60) : 0;
	let cost = accrued(srv.priceHourlyMicros);
	let fee = accrued(srv.feeHourlyMicros);
	if (opts.finalize) {
		cost += Math.max(0, srv.priceHourlyMicros - (srv.totalCostMicros + cost));
		fee += Math.max(0, srv.feeHourlyMicros - (srv.totalFeeMicros + fee));
	}
	if (cost <= 0 && fee <= 0) return 0;
	const billedUntil = new Date(from.getTime() + Math.max(minutes, 0) * MINUTE);

	return db.transaction(async (tx) => {
		const updated = await tx
			.update(server)
			.set({
				billedUntil,
				totalCostMicros: sql`${server.totalCostMicros} + ${cost}`,
				totalFeeMicros: sql`${server.totalFeeMicros} + ${fee}`,
			})
			.where(and(eq(server.id, srv.id), eq(server.billedUntil, from)))
			.returning({ id: server.id });
		if (!updated.length) return null;

		if (fee > 0) {
			await tx
				.insert(creditTransaction)
				.values({
					id: newId("txn"),
					userId: srv.userId,
					kind: "usage",
					amountMicros: -fee,
					description: `Fee · ${srv.name} · ${srv.planName} · ${srv.provider}`,
					serverId: srv.id,
					periodStart: startOfHour(from),
				})
				.onConflictDoUpdate({
					target: [creditTransaction.serverId, creditTransaction.periodStart],
					set: {
						amountMicros: sql`${creditTransaction.amountMicros} - ${fee}`,
						updatedAt: new Date(),
					},
				});
			await tx
				.update(wallet)
				.set({ balanceMicros: sql`${wallet.balanceMicros} - ${fee}` })
				.where(eq(wallet.userId, srv.userId));
		}
		// The account's monthly guardrail counts every server's provider cost.
		if (cost > 0) {
			await tx
				.update(wallet)
				.set(addMonthSpend(cost, until))
				.where(eq(wallet.userId, srv.userId));
		}
		// Spend limits guard what an agent spends at the provider, not just the fee.
		if (srv.apiKeyId && cost > 0) {
			await tx
				.update(apiKey)
				.set({ spentMicros: sql`${apiKey.spentMicros} + ${cost}` })
				.where(eq(apiKey.id, srv.apiKeyId));
		}
		return fee;
	});
}

/** One metering pass over every billable server. */
export async function meterUsage(svc: Services, now = new Date()) {
	const rows = await svc.db
		.select()
		.from(server)
		.where(
			and(isNotNull(server.billedUntil), notInArray(server.status, CLOSED)),
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

/**
 * Hourly rates of a user's billable servers, in micro-USD: the fee HessianLabs
 * charges and the list price their providers bill.
 */
export async function burnRate(
	db: Executor,
	userId: string,
): Promise<{ feeMicros: number; serverMicros: number }> {
	const [row] = await db
		.select({
			fee: sql<string>`coalesce(sum(${server.feeHourlyMicros}), 0)`,
			price: sql<string>`coalesce(sum(${server.priceHourlyMicros}), 0)`,
		})
		.from(server)
		.where(
			and(
				eq(server.userId, userId),
				isNotNull(server.billedUntil),
				notInArray(server.status, CLOSED),
			),
		);
	return {
		feeMicros: Number(row?.fee ?? 0),
		serverMicros: Number(row?.price ?? 0),
	};
}
