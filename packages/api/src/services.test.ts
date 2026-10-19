import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
	createCloud,
	PROVIDER_IDS,
	type ProviderAdapter,
	ProviderError,
	type ProviderId,
} from "@switchyard/cloud";
import {
	activity,
	apiKey,
	creditTransaction,
	providerAccount,
	server,
} from "@switchyard/db/schema/app";
import { eq } from "drizzle-orm";

import type { Actor, Services } from "./context";
import { createMcpServer } from "./mcp";
import { createApiKey } from "./services/api-keys";
import { meterUsage } from "./services/billing";
import { openCredentials } from "./services/credentials";
import { syncServers } from "./services/jobs";
import {
	connectProviderAccount,
	disconnectProviderAccount,
	listProviderAccounts,
} from "./services/provider-accounts";
import { createServer, deleteServer, getServer } from "./services/servers";
import { addCredits, getBalance, quoteTopup } from "./services/wallet";
import {
	createTestDb,
	prepareDatabase,
	resetDatabase,
	sandboxCredentials,
	TEST_CREDENTIALS_KEY,
	TEST_USER,
} from "./testing";

const db = createTestDb();
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
		feeBps: 500,
		credentialsKey: TEST_CREDENTIALS_KEY,
		stripe: null,
	},
};

const USER = TEST_USER;
const actor: Actor = { userId: USER, apiKeyId: null, via: "dashboard" };
const fee = (priceHourlyMicros: number) =>
	Math.ceil((priceHourlyMicros * 500) / 10_000);

const connect = (provider: ProviderId, s: Services = svc) =>
	connectProviderAccount(s, actor, {
		provider,
		credentials: sandboxCredentials(provider),
	});

const credit = (amountMicros: number) =>
	addCredits(db, {
		userId: USER,
		amountMicros,
		kind: "promo",
		description: "t",
	});

/** The same services, with every connected account answering through `adapter`. */
function withAdapter(adapter: Partial<ProviderAdapter>): Services {
	return {
		...svc,
		cloud: {
			...svc.cloud,
			connect: (provider, credentials) => ({
				...svc.cloud.connect(provider, credentials),
				...adapter,
			}),
		},
	};
}

const denied = async () => {
	throw new ProviderError("hetzner", "HTTP 401: unauthorized", {
		status: 401,
	});
};

beforeAll(() => prepareDatabase(db));
beforeEach(async () => {
	await resetDatabase(db);
	for (const id of PROVIDER_IDS) await connect(id);
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
			externalId: "stripe:cs:cs_test_1",
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

describe("provider accounts", () => {
	test("credentials are sealed to their owner and never returned", async () => {
		const [row] = await db
			.select()
			.from(providerAccount)
			.where(eq(providerAccount.provider, "hetzner"));
		expect(row?.credentials).not.toContain("sandbox-token");
		expect(
			JSON.parse(
				openCredentials(
					TEST_CREDENTIALS_KEY,
					row?.credentials ?? "",
					`${USER}:hetzner`,
				),
			),
		).toEqual({ token: "sandbox-token-1234" });
		expect(() =>
			openCredentials(
				TEST_CREDENTIALS_KEY,
				row?.credentials ?? "",
				"user_other:hetzner",
			),
		).toThrow();

		const listed = (await listProviderAccounts(svc, USER)).find(
			(a) => a.provider === "hetzner",
		);
		expect(listed?.hint).toBe("1234");
		expect(JSON.stringify(listed)).not.toContain("sandbox-token");
	});

	test("rejects malformed credentials and ones the provider refuses", async () => {
		await expect(
			connectProviderAccount(svc, actor, {
				provider: "scaleway",
				credentials: { secretKey: "sandbox-secret-key", projectId: "nope" },
			}),
		).rejects.toThrow(/Check the Scaleway credentials/);
		await expect(
			connect("hetzner", withAdapter({ verify: denied })),
		).rejects.toThrow(/rejected these credentials/);
	});
});

describe("servers", () => {
	test("routes to the cheapest match and falls back when a provider is out of capacity", async () => {
		await credit(5e6);
		const res = await createServer(svc, actor, {
			requirements: { minMemoryGb: 4, continents: ["EU"] },
		});
		expect(res.fallbacks).toHaveLength(1);
		expect(res.fallbacks[0]?.planId).toBe("hetzner:cx23");
		expect(res.server.planId).toBe("hetzner:cax11");
		expect(res.server.country).toMatch(/DE|FI/);
		expect(res.server.feeHourlyMicros).toBe(fee(res.server.priceHourlyMicros));
		// No SSH key anywhere → a one-time key is generated and returned.
		expect(res.ssh.privateKey).toContain("BEGIN OPENSSH PRIVATE KEY");
		const running = await getServer(svc, USER, res.server.id);
		expect(running.status).toBe("running");
		expect(running.ipv4).toMatch(/^203\.0\.113\./);
	});

	test("only routes to connected accounts", async () => {
		await credit(5e6);
		await db
			.delete(providerAccount)
			.where(eq(providerAccount.provider, "hetzner"));
		const res = await createServer(svc, actor, {
			requirements: { minMemoryGb: 4, continents: ["EU"] },
		});
		expect(res.server.provider).not.toBe("hetzner");
		await expect(
			createServer(svc, actor, { planId: "hetzner:cax11" }),
		).rejects.toThrow(/Hetzner account isn't connected/);

		await db.delete(providerAccount);
		await expect(
			createServer(svc, actor, { planId: "vultr:vc2-1c-1gb" }),
		).rejects.toThrow(/No cloud account is connected/);
	});

	test("refuses to create without credit for the fee", async () => {
		await expect(
			createServer(svc, actor, { planId: "digitalocean:s-1vcpu-1gb" }),
		).rejects.toThrow(/Insufficient credits/);
	});

	test("rejects a region the plan is not sold in", async () => {
		await credit(5e6);
		await expect(
			createServer(svc, actor, {
				planId: "hetzner:cax11",
				regionId: "hetzner:ash",
			}),
		).rejects.toThrow(/not available/);
	});

	test("enforces API key spend limits and server caps", async () => {
		await credit(50e6);
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
			.set({ maxServers: null, spentMicros: 990_000 })
			.where(eq(apiKey.id, record.id));
		await expect(
			createServer(svc, agent, { planId: "vultr:vc2-1c-1gb" }),
		).rejects.toThrow(/spend limit/);
	});

	test("parallel creates can't slip past a key's server cap", async () => {
		await credit(50e6);
		const { record } = await createApiKey(db, USER, {
			name: "agent",
			maxServers: 2,
		});
		const agent: Actor = { userId: USER, apiKeyId: record.id, via: "mcp" };
		const results = await Promise.allSettled(
			Array.from({ length: 6 }, () =>
				createServer(svc, agent, { planId: "vultr:vc2-1c-1gb" }),
			),
		);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
	});
});

describe("gpu servers", () => {
	test("routes VRAM requirements to GPU clouds with the CUDA image", async () => {
		await credit(20e6);
		const res = await createServer(svc, actor, {
			requirements: { minVramGb: 70 },
		});
		expect(res.server.gpu).toContain("VRAM");
		expect(res.server.image).toBe("ubuntu-22.04-cuda");
		expect(res.server.priceHourlyMicros).toBeGreaterThan(500_000);
	});

	test("rejects the CUDA image on CPU plans", async () => {
		await credit(5e6);
		await expect(
			createServer(svc, actor, {
				planId: "hetzner:cax11",
				image: "ubuntu-22.04-cuda",
			}),
		).rejects.toThrow(/needs a GPU plan/);
	});
});

describe("billing", () => {
	test("charges the fee per minute, aggregates hourly, and never double-bills", async () => {
		await credit(5e6);
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
		expect(first.chargedMicros).toBe(Math.ceil((fee(price) * 10) / 60));
		expect((await meterUsage(svc, tenMinutesLater)).chargedMicros).toBe(0);
		await meterUsage(svc, new Date(start.getTime() + 20 * 60_000));

		const rows = await db
			.select()
			.from(creditTransaction)
			.where(eq(creditTransaction.kind, "usage"));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.amountMicros).toBe(
			-(Math.ceil((fee(price) * 10) / 60) * 2),
		);
		// The key's spend limit tracks what the provider bills, not the fee.
		const [key] = await db
			.select()
			.from(apiKey)
			.where(eq(apiKey.id, record.id));
		expect(key?.spentMicros).toBe(Math.ceil((price * 10) / 60) * 2);
	});

	test("deleting tops the fee up to the one-hour minimum", async () => {
		await credit(5e6);
		const res = await createServer(svc, actor, {
			planId: "linode:g6-nanode-1",
		});
		const deleted = await deleteServer(svc, actor, res.server.id);
		expect(deleted.status).toBe("deleted");
		expect(deleted.totalCostMicros).toBe(res.server.priceHourlyMicros);
		expect(deleted.totalFeeMicros).toBe(res.server.feeHourlyMicros);
		expect(await getBalance(db, USER)).toBe(5e6 - res.server.feeHourlyMicros);
	});

	test("an empty balance blocks new servers but never touches running ones", async () => {
		await credit(1e6);
		const res = await createServer(svc, actor, { planId: "hetzner:cx33" });
		await credit(-1e6);
		await meterUsage(svc, new Date(Date.now() + 3 * 60 * 60_000));
		expect(await getBalance(db, USER)).toBeLessThan(0);
		expect((await getServer(svc, USER, res.server.id)).status).toBe("running");
		await expect(
			createServer(svc, actor, { planId: "hetzner:cx33" }),
		).rejects.toThrow(/Insufficient credits/);
	});
});

describe("sync", () => {
	const later = () => new Date(Date.now() + 10 * 60_000);

	test("a server deleted at the provider is settled and closed", async () => {
		await credit(5e6);
		const res = await createServer(svc, actor, { planId: "vultr:vc2-1c-1gb" });
		const [row] = await db
			.select()
			.from(server)
			.where(eq(server.id, res.server.id));
		await svc.cloud
			.connect("vultr", {})
			.deleteServer(row?.providerServerId ?? "");

		expect((await syncServers(svc, later())).closed).toBe(1);
		const gone = await getServer(svc, USER, res.server.id);
		expect(gone.status).toBe("deleted");
		expect(gone.totalFeeMicros).toBe(res.server.feeHourlyMicros);
		const events = await db
			.select()
			.from(activity)
			.where(eq(activity.action, "server.gone"));
		expect(events).toHaveLength(1);
		// Nothing left to charge.
		expect(
			(await meterUsage(svc, new Date(Date.now() + 5 * 60 * 60_000)))
				.chargedMicros,
		).toBe(0);
	});

	test("credentials that stop working detach the account's servers", async () => {
		await credit(5e6);
		const res = await createServer(svc, actor, { planId: "hetzner:cx33" });
		const broken = withAdapter({ getServer: denied, verify: denied });

		await syncServers(broken, later());
		expect((await getServer(svc, USER, res.server.id)).status).toBe("detached");
		const [account] = await db
			.select()
			.from(providerAccount)
			.where(eq(providerAccount.provider, "hetzner"));
		expect(account?.error).toMatch(/no longer accepts/);
		// Its plans are no longer offered until the credentials are replaced.
		await expect(
			createServer(svc, actor, { planId: "hetzner:cx33" }),
		).rejects.toThrow(/isn't connected/);
	});

	test("a refused call with working credentials changes nothing", async () => {
		await credit(5e6);
		const res = await createServer(svc, actor, { planId: "hetzner:cx33" });
		await syncServers(withAdapter({ getServer: denied }), later());
		expect((await getServer(svc, USER, res.server.id)).status).toBe("running");
	});

	test("disconnecting an account detaches its servers and stops their fee", async () => {
		await credit(5e6);
		const res = await createServer(svc, actor, { planId: "hetzner:cx33" });
		const [account] = await db
			.select()
			.from(providerAccount)
			.where(eq(providerAccount.provider, "hetzner"));
		expect(
			(await disconnectProviderAccount(svc, actor, account?.id ?? "")).detached,
		).toBe(1);
		const detached = await getServer(svc, USER, res.server.id);
		expect(detached.status).toBe("detached");
		expect(detached.totalFeeMicros).toBe(res.server.feeHourlyMicros);
		await expect(deleteServer(svc, actor, res.server.id)).rejects.toThrow(
			/already detached/,
		);
		expect(
			(await meterUsage(svc, new Date(Date.now() + 5 * 60 * 60_000)))
				.chargedMicros,
		).toBe(0);
	});
});

describe("mcp", () => {
	test("exposes the tool set and provisions through create_server", async () => {
		await credit(5e6);
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
		expect(body.server.fee_per_hour).toMatch(/^\$/);

		const bad = await client.callTool({
			name: "get_server",
			arguments: { id: "srv_missing" },
		});
		expect(bad.isError).toBe(true);

		// Searches only cover connected accounts.
		await db.delete(providerAccount);
		const search = await client.callTool({
			name: "search_plans",
			arguments: { min_vcpu: 2 },
		});
		expect(search.isError).toBe(true);
		expect((search.content as { text: string }[])[0]?.text).toMatch(
			/No cloud account is connected/,
		);
		await client.close();
	});
});
