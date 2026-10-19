import { server } from "@switchyard/db/schema/app";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";

import type { Services } from "../context";
import { meterUsage } from "./billing";
import { runAutoTopups } from "./payments";
import { syncServer } from "./servers";

const STUCK_CREATE_MS = 10 * 60 * 1000;
const SYNC_EVERY_MS = 5 * 60 * 1000;
const SYNC_BATCH = 200;

/**
 * Checks settled servers against their provider every few minutes, so one
 * deleted in the provider's console stops accruing fees. Servers stuck in
 * `deleting` (a delete that crashed half way) are picked up the same way.
 */
export async function syncServers(svc: Services, now = new Date()) {
	const rows = await svc.db
		.select()
		.from(server)
		.where(
			and(
				inArray(server.status, ["running", "stopped", "suspended", "deleting"]),
				or(
					isNull(server.syncedAt),
					lt(server.syncedAt, new Date(now.getTime() - SYNC_EVERY_MS)),
				),
			),
		)
		.orderBy(asc(server.syncedAt))
		.limit(SYNC_BATCH);
	let closed = 0;
	for (const row of rows) {
		try {
			const after = await syncServer(svc, row, now);
			if (after.status === "deleted" || after.status === "detached") closed++;
		} catch (err) {
			console.error(`[jobs] sync ${row.id} failed:`, (err as Error).message);
		}
	}
	return { checked: rows.length, closed };
}

/** Advances servers that are still booting and fails orders that never reached a provider. */
export async function reconcileProvisioning(svc: Services, now = new Date()) {
	const rows = await svc.db
		.select()
		.from(server)
		.where(eq(server.status, "provisioning"));
	for (const row of rows) {
		if (row.providerServerId) {
			await syncServer(svc, row, now);
		} else if (now.getTime() - row.createdAt.getTime() > STUCK_CREATE_MS) {
			await svc.db
				.update(server)
				.set({
					status: "error",
					errorMessage: "Order never reached the provider",
					deletedAt: now,
				})
				.where(and(eq(server.id, row.id), isNull(server.providerServerId)));
		}
	}
}

/** Starts the background loops. Returns a stop function. */
export function startJobs(
	svc: Services,
	opts: { meterEveryMs?: number; reconcileEveryMs?: number } = {},
) {
	let running = false;
	const meter = setInterval(async () => {
		if (running) return;
		running = true;
		try {
			// Close servers deleted at the provider before charging for another minute.
			await syncServers(svc);
			await meterUsage(svc);
			await runAutoTopups(svc);
		} catch (err) {
			console.error("[jobs] metering failed:", err);
		} finally {
			running = false;
		}
	}, opts.meterEveryMs ?? 60_000);
	const reconcile = setInterval(() => {
		reconcileProvisioning(svc).catch((err) =>
			console.error("[jobs] reconcile failed:", err),
		);
	}, opts.reconcileEveryMs ?? 5_000);
	return () => {
		clearInterval(meter);
		clearInterval(reconcile);
	};
}
