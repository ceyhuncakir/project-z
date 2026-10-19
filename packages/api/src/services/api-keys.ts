import { createHash, randomBytes } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { usdToMicros } from "@switchyard/cloud";
import { type Executor, newId } from "@switchyard/db";
import { apiKey } from "@switchyard/db/schema/app";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { ApiKeyRecord } from "../context";

export const API_KEY_PREFIX = "hl_live_";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

function randomBase62(length: number) {
	const bytes = randomBytes(length);
	let out = "";
	for (const b of bytes) out += BASE62[b % 62];
	return out;
}

export async function createApiKey(
	db: Executor,
	userId: string,
	input: {
		name: string;
		spendLimitUsd?: number | null;
		maxServers?: number | null;
	},
) {
	const key = `${API_KEY_PREFIX}${randomBase62(40)}`;
	const [record] = await db
		.insert(apiKey)
		.values({
			id: newId("key"),
			userId,
			name: input.name,
			prefix: key.slice(0, API_KEY_PREFIX.length + 6),
			hash: hashKey(key),
			spendLimitMicros: input.spendLimitUsd
				? usdToMicros(input.spendLimitUsd)
				: null,
			maxServers: input.maxServers ?? null,
		})
		.returning();
	// The plaintext key is only ever returned here.
	return { key, record: record as ApiKeyRecord };
}

export async function verifyApiKey(
	db: Executor,
	token: string,
): Promise<ApiKeyRecord | null> {
	if (!token.startsWith(API_KEY_PREFIX)) return null;
	const [record] = await db
		.select()
		.from(apiKey)
		.where(and(eq(apiKey.hash, hashKey(token)), isNull(apiKey.revokedAt)));
	if (!record) return null;
	// Throttle last-used writes to once a minute per key.
	if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
		await db
			.update(apiKey)
			.set({ lastUsedAt: new Date() })
			.where(eq(apiKey.id, record.id));
	}
	return record;
}

export async function listApiKeys(db: Executor, userId: string) {
	return db
		.select()
		.from(apiKey)
		.where(and(eq(apiKey.userId, userId), isNull(apiKey.revokedAt)))
		.orderBy(desc(apiKey.createdAt));
}

export async function updateApiKey(
	db: Executor,
	userId: string,
	id: string,
	input: {
		name?: string;
		spendLimitUsd?: number | null;
		maxServers?: number | null;
	},
) {
	const [record] = await db
		.update(apiKey)
		.set({
			name: input.name,
			spendLimitMicros:
				input.spendLimitUsd === undefined
					? undefined
					: input.spendLimitUsd === null
						? null
						: usdToMicros(input.spendLimitUsd),
			maxServers: input.maxServers,
		})
		.where(
			and(
				eq(apiKey.id, id),
				eq(apiKey.userId, userId),
				isNull(apiKey.revokedAt),
			),
		)
		.returning();
	if (!record)
		throw new ORPCError("NOT_FOUND", { message: "API key not found" });
	return record;
}

export async function revokeApiKey(db: Executor, userId: string, id: string) {
	const [record] = await db
		.update(apiKey)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(apiKey.id, id),
				eq(apiKey.userId, userId),
				isNull(apiKey.revokedAt),
			),
		)
		.returning({ id: apiKey.id });
	if (!record)
		throw new ORPCError("NOT_FOUND", { message: "API key not found" });
}

export function serializeApiKey(k: ApiKeyRecord) {
	return {
		id: k.id,
		name: k.name,
		prefix: k.prefix,
		spendLimitMicros: k.spendLimitMicros,
		spentMicros: k.spentMicros,
		maxServers: k.maxServers,
		lastUsedAt: k.lastUsedAt,
		createdAt: k.createdAt,
	};
}
