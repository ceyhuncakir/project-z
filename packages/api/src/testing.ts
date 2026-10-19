import path from "node:path";

import { createDb } from "@switchyard/db";
import { wallet } from "@switchyard/db/schema/app";
import { user } from "@switchyard/db/schema/auth";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client as PgClient } from "pg";

import type { Email } from "./context";

/** Shared Postgres setup for integration tests. */

const TEST_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:password@localhost:5432/switchyard_test";

export const TEST_USER = "user_test";

/** Seals credentials in tests. Production reads CREDENTIALS_KEY. */
export const TEST_CREDENTIALS_KEY = Buffer.alloc(32, 7);

const SANDBOX_CREDENTIALS: Record<string, Record<string, string>> = {
	vultr: { apiKey: "sandbox-api-key" },
	scaleway: {
		secretKey: "sandbox-secret-key",
		projectId: "00000000-0000-4000-8000-000000000000",
	},
	ovhcloud: {
		endpoint: "ovh-eu",
		applicationKey: "sandbox-app-key",
		applicationSecret: "sandbox-app-secret",
		consumerKey: "sandbox-consumer-key",
		projectId: "sandbox-project",
	},
};

/** Credentials that pass validation; sandbox mode never sends them anywhere. */
export const sandboxCredentials = (provider: string) =>
	SANDBOX_CREDENTIALS[provider] ?? { token: "sandbox-token-1234" };

/** Every email the services sent since the last resetDatabase. */
export const outbox: Email[] = [];
export const testMail = async (email: Email) => {
	outbox.push(email);
};

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
		sql`truncate table "user", wallet, credit_transaction, api_key, ssh_key, provider_account, server, activity, notification_settings, guardrails, team_member, team_invitation, security_event cascade`,
	);
	outbox.length = 0;
	await db
		.insert(user)
		.values({ id: TEST_USER, name: "Test", email: "test@example.com" });
	await db.insert(wallet).values({ userId: TEST_USER });
}
