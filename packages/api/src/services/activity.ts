import { type Executor, newId } from "@switchyard/db";
import { activity } from "@switchyard/db/schema/app";
import { and, desc, eq, lt } from "drizzle-orm";

import type { Actor } from "../context";

export async function logActivity(
	db: Executor,
	actor: Actor,
	entry: {
		action: string;
		message: string;
		serverId?: string;
		metadata?: Record<string, unknown>;
	},
) {
	await db.insert(activity).values({
		id: newId("act"),
		userId: actor.userId,
		apiKeyId: actor.apiKeyId,
		actor: actor.via,
		...entry,
	});
}

export async function listActivity(
	db: Executor,
	userId: string,
	opts: { limit?: number; before?: Date; serverId?: string } = {},
) {
	return db
		.select()
		.from(activity)
		.where(
			and(
				eq(activity.userId, userId),
				opts.before ? lt(activity.createdAt, opts.before) : undefined,
				opts.serverId ? eq(activity.serverId, opts.serverId) : undefined,
			),
		)
		.orderBy(desc(activity.createdAt))
		.limit(Math.min(opts.limit ?? 50, 200));
}
