import { ORPCError } from "@orpc/server";
import { usdToMicros } from "@switchyard/cloud";
import { type Executor, newId } from "@switchyard/db";
import { creditTransaction, wallet } from "@switchyard/db/schema/app";
import { and, desc, eq, lt, sql } from "drizzle-orm";

/** OpenRouter-style pricing: provider prices pass through, a small fee applies on top-ups. */
export const TOPUP_FEE_PERCENT = 5;
export const TOPUP_FEE_MIN_MICROS = usdToMicros(0.5);
export const TOPUP_MIN_USD = 5;
export const TOPUP_MAX_USD = 2_000;

export function quoteTopup(amountUsd: number) {
	if (
		!Number.isFinite(amountUsd) ||
		amountUsd < TOPUP_MIN_USD ||
		amountUsd > TOPUP_MAX_USD
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Top-ups must be between $${TOPUP_MIN_USD} and $${TOPUP_MAX_USD}.`,
		});
	}
	const creditMicros = usdToMicros(Math.round(amountUsd * 100) / 100);
	// Round the fee up to the cent so the charged total is a whole number of cents.
	const rawFee = Math.max(
		(creditMicros * TOPUP_FEE_PERCENT) / 100,
		TOPUP_FEE_MIN_MICROS,
	);
	const feeMicros = Math.ceil(rawFee / 10_000) * 10_000;
	return { creditMicros, feeMicros, totalMicros: creditMicros + feeMicros };
}

export async function ensureWallet(db: Executor, userId: string) {
	await db.insert(wallet).values({ userId }).onConflictDoNothing();
}

export async function getBalance(
	db: Executor,
	userId: string,
): Promise<number> {
	const [row] = await db
		.select({ balance: wallet.balanceMicros })
		.from(wallet)
		.where(eq(wallet.userId, userId));
	return row?.balance ?? 0;
}

/**
 * Adds (or removes, if negative) credit. When `externalId` is set the call is
 * idempotent, so a redelivered payment webhook can never double-credit.
 */
export async function addCredits(
	db: Executor,
	entry: {
		userId: string;
		amountMicros: number;
		kind: "topup" | "refund" | "adjustment" | "promo";
		description: string;
		externalId?: string;
		metadata?: Record<string, unknown>;
	},
): Promise<{ applied: boolean }> {
	return db.transaction(async (tx) => {
		const inserted = await tx
			.insert(creditTransaction)
			.values({ id: newId("txn"), ...entry })
			.onConflictDoNothing({ target: creditTransaction.externalId })
			.returning({ id: creditTransaction.id });
		if (!inserted.length) return { applied: false };
		await tx
			.insert(wallet)
			.values({ userId: entry.userId, balanceMicros: entry.amountMicros })
			.onConflictDoUpdate({
				target: wallet.userId,
				set: {
					balanceMicros: sql`${wallet.balanceMicros} + ${entry.amountMicros}`,
				},
			});
		return { applied: true };
	});
}

export async function listTransactions(
	db: Executor,
	userId: string,
	opts: { limit?: number; before?: Date } = {},
) {
	return db
		.select()
		.from(creditTransaction)
		.where(
			and(
				eq(creditTransaction.userId, userId),
				opts.before ? lt(creditTransaction.createdAt, opts.before) : undefined,
			),
		)
		.orderBy(desc(creditTransaction.createdAt))
		.limit(Math.min(opts.limit ?? 50, 200));
}
