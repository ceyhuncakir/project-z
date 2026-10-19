import path from "node:path";

import { createDb } from "@switchyard/db";
import { wallet } from "@switchyard/db/schema/app";
import { user } from "@switchyard/db/schema/auth";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client as PgClient } from "pg";

/** Shared Postgres setup for integration tests. */

const TEST_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:password@localhost:5432/switchyard_test";

export const TEST_USER = "user_test";

export function createTestDb() {
	return createDb({ DATABASE_URL: TEST_URL });
}

type TestDb = ReturnType<typeof createTestDb>;

export async function prepareDatabase(db: TestDb) {
	const url = new URL(TEST_URL);
	const dbName = url.pathname.slice(1);
	url.pathname = "/postgres";
	const admin = new PgClient({ connectionString: url.toString() });
	await admin.connect();
	const exists = await admin.query(
		"select 1 from pg_database where datname = $1",
		[dbName],
	);
	if (!exists.rowCount) await admin.query(`create database "${dbName}"`);
	await admin.end();
	await migrate(db, {
		migrationsFolder: path.resolve(import.meta.dir, "../../db/src/migrations"),
	});
}

export async function resetDatabase(db: TestDb) {
	await db.execute(
		sql`truncate table "user", wallet, credit_transaction, api_key, ssh_key, server, activity cascade`,
	);
	await db
		.insert(user)
		.values({ id: TEST_USER, name: "Test", email: "test@example.com" });
	await db.insert(wallet).values({ userId: TEST_USER });
}
