import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCloud } from "@switchyard/cloud";
import { createDb } from "@switchyard/db";
import {
	apiKey,
	creditTransaction,
	server,
	wallet,
} from "@switchyard/db/schema/app";
import { user } from "@switchyard/db/schema/auth";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client as PgClient } from "pg";

import type { Actor, Services } from "./context";
import { createMcpServer } from "./mcp";
import { createApiKey } from "./services/api-keys";
import { meterUsage } from "./services/billing";
import { enforceBalances } from "./services/jobs";
import { createServer, deleteServer, getServer } from "./services/servers";
import { addCredits, getBalance, quoteTopup } from "./services/wallet";

const TEST_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:password@localhost:5432/switchyard_test";

const db = createDb({ DATABASE_URL: TEST_URL });
const svc: Services = {
	db,
	// Hetzner's cheapest EU plan is "sold out" so the router has to fall back.
	cloud: createCloud({
		sandboxOnly: true,
		sandbox: { bootMs: 0, outOfCapacity: ["cx23"] },
	}),
	config: {
		webUrl: "http://web.test",
		apiUrl: "http://api.test",
		allowTestCredits: true,
		githubAuth: false,
		polar: null,
	},
};

const USER = "user_test";
const actor: Actor = { userId: USER, apiKeyId: null, via: "dashboard" };

beforeAll(async () => {
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
});

beforeEach(async () => {
	await db.execute(
		sql`truncate table "user", wallet, credit_transaction, api_key, ssh_key, server, activity cascade`,
	);
	await db
		.insert(user)
		.values({ id: USER, name: "Test", email: "test@example.com" });
	await db.insert(wallet).values({ userId: USER });
});

afterAll(async () => {
	await db.$client.end();
});

describe("wallet", () => {
	test("credits with the same external id apply once", async () => {
		const entry = {
			userId: USER,
			amountMicros: 10_000_000,
			kind: "topup" as const,
			description: "Top-up",
			externalId: "polar:order_1",
		};
		expect((await addCredits(db, entry)).applied).toBe(true);
		expect((await addCredits(db, entry)).applied).toBe(false);
		expect(await getBalance(db, USER)).toBe(10_000_000);
	});

	test("top-up fee is 5% with a $0.50 minimum", () => {
		expect(quoteTopup(50)).toEqual({
			creditMicros: 50e6,
			feeMicros: 2.5e6,
			totalMicros: 52.5e6,
		});
		expect(quoteTopup(5).feeMicros).toBe(0.5e6);
		expect(() => quoteTopup(1)).toThrow();
	});
});

describe("servers", () => {
	test("routes to the cheapest match and falls back when a provider is out of capacity", async () => {
		await addCredits(db, {
			userId: USER,
			amountMicros: 5e6,
			kind: "promo",
			description: "t",
		});
		const res = await createServer(svc, actor, {
			requirements: { minMemoryGb: 4, continents: ["EU"] },
		});
		expect(res.fallbacks).toHaveLength(1);
		expect(res.fallbacks[0]?.planId).toBe("hetzner:cx23");
		expect(res.server.planId).toBe("hetzner:cax11");
		expect(res.server.country).toMatch(/DE|FI/);
		// No SSH key anywhere → a one-time key is generated and returned.
		expect(res.ssh.privateKey).toContain("BEGIN OPENSSH PRIVATE KEY");
		const running = await getServer(svc, USER, res.server.id);
		expect(running.status).toBe("running");
		expect(running.ipv4).toMatch(/^203\.0\.113\./);
	});

	test("refuses to create without an hour of credit", async () => {
		await expect(
			createServer(svc, actor, { planId: "digitalocean:s-1vcpu-1gb" }),
		).rejects.toThrow(/Insufficient credits/);
	});

	test("rejects a region the plan is not sold in", async () => {
		await addCredits(db, {
			userId: USER,
			amountMicros: 5e6,
			kind: "promo",
			description: "t",
		});
		await expect(
			createServer(svc, actor, {
				planId: "hetzner:cax11",
				regionId: "hetzner:ash",
			}),
		).rejects.toThrow(/not available/);
	});

	test("enforces API key spend limits and server caps", async () => {
		await addCredits(db, {
			userId: USER,
			amountMicros: 50e6,
			kind: "promo",
			description: "t",
		});
		const { record } = await createApiKey(db, USER, {
			name: "agent",
			maxServers: 1,
			spendLimitUsd: 1,
		});
		const agent: Actor = { userId: USER, apiKeyId: record.id, via: "mcp" };
		await createServer(svc, agent, { planId: "vultr:vc2-1c-1gb" });
		await expect(
			createServer(svc, agent, { planId: "vultr:vc2-1c-1gb" }),
		).rejects.toThrow(/at most 1/);

		await db
			.update(apiKey)
			.set({ maxServers: null, spentMicros: 999_000 })
			.where(eq(apiKey.id, record.id));
		await expect(
			createServer(svc, agent, { planId: "vultr:vc2-1c-1gb" }),
		).rejects.toThrow(/spend limit/);
	});
});

describe("billing", () => {
	test("meters per minute, aggregates hourly, and never double-bills", async () => {
		await addCredits(db, {
			userId: USER,
			amountMicros: 5e6,
			kind: "promo",
			description: "t",
		});
		const { record } = await createApiKey(db, USER, { name: "agent" });
		const res = await createServer(
			svc,
			{ userId: USER, apiKeyId: record.id, via: "api" },
			{ planId: "digitalocean:s-2vcpu-4gb" },
		);
		const price = res.server.priceHourlyMicros;
		const start = new Date("2026-01-01T10:00:00Z");
		await db
			.update(server)
			.set({ billedUntil: start })
			.where(eq(server.id, res.server.id));

		const tenMinutesLater = new Date(start.getTime() + 10 * 60_000 + 30_000);
		const first = await meterUsage(svc, tenMinutesLater);
		expect(first.chargedMicros).toBe(Math.ceil((price * 10) / 60));
		expect((await meterUsage(svc, tenMinutesLater)).chargedMicros).toBe(0);
		await meterUsage(svc, new Date(start.getTime() + 20 * 60_000));

		const rows = await db
			.select()
			.from(creditTransaction)
			.where(eq(creditTransaction.kind, "usage"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.amountMicros).toBe(-(Math.ceil((price * 10) / 60) * 2));
		const [key] = await db
			.select()
			.from(apiKey)
			.where(eq(apiKey.id, record.id));
		expect(key?.spentMicros).toBe(-(rows[0]?.amountMicros ?? 0));
	});

	test("deleting tops the bill up to the one-hour minimum", async () => {
		await addCredits(db, {
			userId: USER,
			amountMicros: 5e6,
			kind: "promo",
			description: "t",
		});
		const res = await createServer(svc, actor, {
			planId: "linode:g6-nanode-1",
		});
		const deleted = await deleteServer(svc, actor, res.server.id);
		expect(deleted.status).toBe("deleted");
		expect(deleted.totalCostMicros).toBe(res.server.priceHourlyMicros);
		expect(await getBalance(db, USER)).toBe(5e6 - res.server.priceHourlyMicros);
	});

	test("suspends servers at zero balance and destroys them after 24 hours", async () => {
		await addCredits(db, {
			userId: USER,
			amountMicros: 1e6,
			kind: "promo",
			description: "t",
		});
		const res = await createServer(svc, actor, { planId: "hetzner:cx33" });
		await db
			.update(wallet)
			.set({ balanceMicros: 0 })
			.where(eq(wallet.userId, USER));

		const now = new Date();
		expect((await enforceBalances(svc, now)).suspended).toBe(1);
		expect((await getServer(svc, USER, res.server.id)).status).toBe(
			"suspended",
		);

		const later = new Date(now.getTime() + 25 * 60 * 60 * 1000);
		expect((await enforceBalances(svc, later)).destroyed).toBe(1);
		expect((await getServer(svc, USER, res.server.id)).status).toBe("deleted");
	});
});

describe("mcp", () => {
	test("exposes the tool set and provisions through create_server", async () => {
		await addCredits(db, {
			userId: USER,
			amountMicros: 5e6,
			kind: "promo",
			description: "t",
		});
		const { record } = await createApiKey(db, USER, { name: "claude" });
		const [clientT, serverT] = InMemoryTransport.createLinkedPair();
		await createMcpServer(svc, record).connect(serverT);
		const client = new Client({ name: "test", version: "1.0.0" });
		await client.connect(clientT);

		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name)).toContain("create_server");
		expect(
			tools.find((t) => t.name === "delete_server")?.annotations
				?.destructiveHint,
		).toBe(true);

		const created = await client.callTool({
			name: "create_server",
			arguments: { min_vcpu: 2, continents: ["NA"], ssh_public_keys: [] },
		});
		const body = JSON.parse(
			(created.content as { text: string }[])[0]?.text ?? "{}",
		);
		expect(created.isError).toBeFalsy();
		expect(body.server.location).toMatch(/US|CA/);

		const bad = await client.callTool({
			name: "get_server",
			arguments: { id: "srv_missing" },
		});
		expect(bad.isError).toBe(true);
		await client.close();
	});
});
