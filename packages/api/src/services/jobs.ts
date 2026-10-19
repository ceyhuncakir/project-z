import type { ProviderId } from "@switchyard/cloud";
import { server, wallet } from "@switchyard/db/schema/app";
import { and, eq, inArray, isNull, lt, lte } from "drizzle-orm";

import type { Actor, Services } from "../context";
import { logActivity } from "./activity";
import { meterUsage } from "./billing";
import { runAutoTopups } from "./payments";
import { destroyServer, refreshServer } from "./servers";

const SUSPEND_GRACE_MS = 24 * 60 * 60 * 1000;
const STUCK_CREATE_MS = 10 * 60 * 1000;

const system = (userId: string): Actor => ({
	userId,
	apiKeyId: null,
	via: "system",
});

/**
 * Out of credits → power servers off ("suspended"). Still out of credits a
 * day later → destroy them. Topping up lets the user start them again.
 */
export async function enforceBalances(svc: Services, now = new Date()) {
	const toSuspend = await svc.db
		.select({ server })
		.from(server)
		.innerJoin(wallet, eq(wallet.userId, server.userId))
		.where(
			and(
				lte(wallet.balanceMicros, 0),
				inArray(server.status, ["running", "provisioning"]),
			),
		);
	for (const { server: row } of toSuspend) {
		try {
			if (row.providerServerId) {
				await svc.cloud
					.adapter(row.provider as ProviderId)
					.powerAction(row.providerServerId, "stop");
			}
			await svc.db
				.update(server)
				.set({ status: "suspended", suspendedAt: now })
				.where(eq(server.id, row.id));
			await logActivity(svc.db, system(row.userId), {
				action: "server.suspend",
				serverId: row.id,
				message: `Suspended ${row.name}: credit balance reached zero`,
			});
		} catch (err) {
			console.error(`[jobs] suspend ${row.id} failed:`, (err as Error).message);
		}
	}

	const toDestroy = await svc.db
		.select({ server })
		.from(server)
		.innerJoin(wallet, eq(wallet.userId, server.userId))
		.where(
			and(
				lte(wallet.balanceMicros, 0),
				eq(server.status, "suspended"),
				lt(server.suspendedAt, new Date(now.getTime() - SUSPEND_GRACE_MS)),
			),
		);
	for (const { server: row } of toDestroy) {
		try {
			await destroyServer(
				svc,
				system(row.userId),
				row,
				"suspended for 24h without credits",
			);
		} catch (err) {
			console.error(`[jobs] destroy ${row.id} failed:`, (err as Error).message);
		}
	}
	return { suspended: toSuspend.length, destroyed: toDestroy.length };
}

/** Advances servers that are still booting and fails orders that never reached a provider. */
export async function reconcileProvisioning(svc: Services, now = new Date()) {
	const rows = await svc.db
		.select()
		.from(server)
		.where(eq(server.status, "provisioning"));
	for (const row of rows) {
		if (row.providerServerId) {
			await refreshServer(svc, row);
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
			await meterUsage(svc);
			// Top up before enforcing, so a saved card prevents suspensions.
			await runAutoTopups(svc);
			await enforceBalances(svc);
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
