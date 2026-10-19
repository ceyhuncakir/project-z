import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { call } from "@orpc/server";
import { createCloud } from "@switchyard/cloud";
import { providerAccount, server, wallet } from "@switchyard/db/schema/app";
import { session, user } from "@switchyard/db/schema/auth";
import { eq } from "drizzle-orm";

import type { Actor, Context, Services } from "./context";
import { appRouter } from "./routers/index";
import { deletionBlockers, exportData } from "./services/account-data";
import { createApiKey } from "./services/api-keys";
import { meterUsage } from "./services/billing";
import { expireServers, sendLongRunningAlerts } from "./services/expiry";
import { getGuardrails, updateGuardrails } from "./services/guardrails";
import { notify, updateNotificationSettings } from "./services/notifications";
import { connectProviderAccount } from "./services/provider-accounts";
import { listSecurityEvents, recordSignIn } from "./services/security";
import {
	createServer,
	deleteServer,
	keepServer,
	listServers,
} from "./services/servers";
import {
	acceptInvitation,
	inviteMember,
	listMembers,
	removeMember,
	resolveAccount,
	updateMemberRole,
} from "./services/team";
import { addCredits } from "./services/wallet";
import {
	createTestDb,
	outbox,
	prepareDatabase,
	resetDatabase,
	sandboxCredentials,
	TEST_CREDENTIALS_KEY,
	TEST_USER,
	testMail,
} from "./testing";

const db = createTestDb();
const svc: Services = {
	db,
	cloud: createCloud({ sandboxOnly: true, sandbox: { bootMs: 0 } }),
	config: {
		webUrl: "http://web.test",
		apiUrl: "http://api.test",
		allowTestCredits: true,
		githubAuth: false,
		feeBps: 500,
		credentialsKey: TEST_CREDENTIALS_KEY,
		stripe: null,
	},
	mail: testMail,
};

const OWNER = TEST_USER;
const MATE = "user_mate";
const MATE_EMAIL = "mate@example.com";
const HOUR = 3_600_000;

const owner: Actor = {
	userId: OWNER,
	apiKeyId: null,
	via: "dashboard",
	memberId: OWNER,
	role: "owner",
};
/** The teammate acting in the owner's account. */
const mate = (role: "admin" | "member"): Actor => ({
	userId: OWNER,
	apiKeyId: null,
	via: "dashboard",
	memberId: MATE,
	role,
});
const agent: Actor = {
	userId: OWNER,
	apiKeyId: null,
	via: "mcp",
	role: "member",
};

const credit = (amountMicros: number) =>
	addCredits(db, {
		userId: OWNER,
		amountMicros,
		kind: "promo",
		description: "t",
	});
const connect = (provider: "hetzner" | "digitalocean") =>
	connectProviderAccount(svc, owner, {
		provider,
		credentials: sandboxCredentials(provider),
	});
const tokenFrom = (text: string) =>
	text.match(/\/invite\/([\w-]+)/)?.[1] as string;

async function addSession(userId: string) {
	const id = `ses_${userId}`;
	await db.insert(session).values({
		id,
		token: `tok_${userId}`,
		userId,
		expiresAt: new Date(Date.now() + 86_400_000),
		updatedAt: new Date(),
	});
	return id;
}

/** Invites MATE and accepts, the way the dashboard does. */
async function joinTeam(role: "admin" | "member" = "member") {
	await inviteMember(
		svc,
		owner,
		{ name: "Test", email: "test@example.com" },
		{
			email: MATE_EMAIL,
			role,
		},
	);
	const token = tokenFrom(outbox.at(-1)?.text ?? "");
	const sessionId = await addSession(MATE);
	await acceptInvitation(
		svc,
		{ id: MATE, email: MATE_EMAIL },
		sessionId,
		token,
	);
	return sessionId;
}

beforeAll(() => prepareDatabase(db));
beforeEach(async () => {
	await resetDatabase(db);
	await db.insert(user).values({ id: MATE, name: "Mate", email: MATE_EMAIL });
	await db.insert(wallet).values({ userId: MATE });
	await connect("hetzner");
	await credit(20e6);
});
afterAll(() => db.$client.end());

describe("team", () => {
	test("a teammate acts in the owner's account and shares its servers", async () => {
		await joinTeam();
		const [invite] = outbox;
		expect(invite?.to).toBe(MATE_EMAIL);
		expect(invite?.subject).toBe(
			"Test invited you to their HessianLabs account",
		);

		const sessionId = `ses_${MATE}`;
		const [row] = await db
			.select()
			.from(session)
			.where(eq(session.id, sessionId));
		expect(row?.activeAccountId).toBe(OWNER);
		expect(await resolveAccount(db, MATE, OWNER)).toEqual({
			accountId: OWNER,
			role: "member",
		});

		const res = await createServer(svc, mate("member"), {
			planId: "hetzner:cx33",
		});
		expect((await listServers(svc, OWNER)).map((s) => s.id)).toEqual([
			res.server.id,
		]);
		expect(await listServers(svc, MATE)).toEqual([]);
	});

	test("only the invited email can accept, and only before it expires", async () => {
		await inviteMember(
			svc,
			owner,
			{ name: "Test", email: "test@example.com" },
			{
				email: "someone@example.com",
				role: "member",
			},
		);
		const token = tokenFrom(outbox[0]?.text ?? "");
		const sessionId = await addSession(MATE);
		await expect(
			acceptInvitation(svc, { id: MATE, email: MATE_EMAIL }, sessionId, token),
		).rejects.toThrow(/is for someone@example.com/);
		await expect(
			acceptInvitation(svc, { id: MATE, email: MATE_EMAIL }, sessionId, "nope"),
		).rejects.toThrow(/expired or was cancelled/);
	});

	test("members can't manage the team; removing someone signs them out of it", async () => {
		await joinTeam("member");
		const { members } = await listMembers(db, OWNER);
		const id = members[0]?.id as string;
		await expect(
			inviteMember(
				svc,
				mate("member"),
				{ name: "Mate", email: MATE_EMAIL },
				{
					email: "x@example.com",
					role: "member",
				},
			),
		).rejects.toThrow(/owner or admins can invite/);
		await expect(
			updateMemberRole(svc, mate("member"), id, "admin"),
		).rejects.toThrow(/owner or admins/);

		await updateMemberRole(svc, owner, id, "admin");
		expect((await listMembers(db, OWNER)).members[0]?.role).toBe("admin");
		await removeMember(svc, owner, id);
		expect(await resolveAccount(db, MATE, OWNER)).toEqual({
			accountId: MATE,
			role: "owner",
		});
		const [row] = await db
			.select()
			.from(session)
			.where(eq(session.userId, MATE));
		expect(row?.activeAccountId).toBeNull();
	});

	test("account emails go to the owner and admins, by their own settings", async () => {
		await joinTeam("member");
		const email = { subject: "s", text: "t" };
		await notify(svc, OWNER, "lowBalance", email);
		expect(outbox.slice(1).map((e) => e.to)).toEqual(["test@example.com"]);

		const id = (await listMembers(db, OWNER)).members[0]?.id as string;
		await updateMemberRole(svc, owner, id, "admin");
		await notify(svc, OWNER, "lowBalance", email);
		expect(outbox.slice(2).map((e) => e.to)).toEqual([
			"test@example.com",
			MATE_EMAIL,
		]);

		await updateNotificationSettings(db, MATE, { lowBalance: false });
		await notify(svc, OWNER, "lowBalance", email);
		expect(outbox.slice(4).map((e) => e.to)).toEqual(["test@example.com"]);
	});
});

describe("guardrails", () => {
	test("agents only get providers, regions and prices the account allows", async () => {
		await connect("digitalocean");
		await updateGuardrails(db, OWNER, {
			...(await editable()),
			allowedProviders: ["digitalocean"],
		});
		const res = await createServer(svc, agent, {});
		expect(res.server.provider).toBe("digitalocean");
		await expect(
			createServer(svc, agent, { planId: "hetzner:cx33" }),
		).rejects.toThrow(/may only use DigitalOcean/);
		// People in the dashboard aren't limited.
		await createServer(svc, owner, { planId: "hetzner:cx33" });

		await updateGuardrails(db, OWNER, {
			...(await editable()),
			allowedContinents: ["NA"],
		});
		expect((await createServer(svc, agent, {})).server.country).toMatch(
			/US|CA/,
		);

		await updateGuardrails(db, OWNER, {
			...(await editable()),
			maxHourlyPriceUsd: 0.0001,
		});
		await expect(createServer(svc, agent, {})).rejects.toThrow(
			/agents may create servers up to \$0\.0001\/h/,
		);
	});

	test("GPU servers can be switched off for agents", async () => {
		await updateGuardrails(db, OWNER, {
			...(await editable()),
			allowGpu: false,
		});
		await expect(
			createServer(svc, agent, { requirements: { kind: "gpu" } }),
		).rejects.toThrow(/may not create GPU servers/);
	});

	test("the server cap and monthly limit count the whole account", async () => {
		await updateGuardrails(db, OWNER, { ...(await editable()), maxServers: 1 });
		await createServer(svc, owner, { planId: "hetzner:cx33" });
		await expect(createServer(svc, agent, {})).rejects.toThrow(
			/at most 1 active server/,
		);

		await updateGuardrails(db, OWNER, {
			...(await editable()),
			maxServers: null,
			monthlySpendLimitUsd: 5,
		});
		const now = new Date();
		const thisMonth = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
		);
		await db
			.update(wallet)
			.set({ monthSpentMicros: 5e6, monthStartedAt: thisMonth })
			.where(eq(wallet.userId, OWNER));
		await expect(createServer(svc, agent, {})).rejects.toThrow(/monthly limit/);
		// Last month's spending doesn't count.
		await db
			.update(wallet)
			.set({ monthStartedAt: new Date(thisMonth.getTime() - 86_400_000) })
			.where(eq(wallet.userId, OWNER));
		await createServer(svc, agent, {});
	});

	test("metering adds each server's provider cost to the month", async () => {
		const res = await createServer(svc, owner, { planId: "hetzner:cx33" });
		await meterUsage(svc, new Date(Date.now() + 2 * HOUR));
		const [w] = await db.select().from(wallet).where(eq(wallet.userId, OWNER));
		const [s] = await db
			.select()
			.from(server)
			.where(eq(server.id, res.server.id));
		expect(w?.monthSpentMicros).toBeGreaterThan(0);
		expect(w?.monthSpentMicros).toBe(s?.totalCostMicros as number);
	});
});

/** The current guardrails in the shape updateGuardrails takes. */
async function editable() {
	const g = await getGuardrails(db, OWNER);
	const usd = (m: number | null) => (m === null ? null : m / 1e6);
	return {
		monthlySpendLimitUsd: usd(g.monthlySpendLimitMicros),
		maxServers: g.maxServers,
		maxHourlyPriceUsd: usd(g.maxHourlyPriceMicros),
		allowedProviders: g.allowedProviders,
		allowedContinents: g.allowedContinents,
		allowGpu: g.allowGpu,
		defaultTtlHours: g.defaultTtlHours,
		longRunningHours: g.longRunningHours,
	};
}

describe("time limits", () => {
	const hoursLeft = (expiresAt: Date | null) =>
		expiresAt ? Math.round((expiresAt.getTime() - Date.now()) / HOUR) : null;

	test("agents get the account's limit and may only shorten or extend within it", async () => {
		await updateGuardrails(db, OWNER, {
			...(await editable()),
			defaultTtlHours: 4,
		});
		const a = await createServer(svc, agent, {});
		expect(hoursLeft(a.server.expiresAt)).toBe(4);
		expect(
			hoursLeft(
				(await createServer(svc, agent, { ttlHours: 10 })).server.expiresAt,
			),
		).toBe(4);
		expect(
			hoursLeft(
				(await createServer(svc, agent, { ttlHours: 2 })).server.expiresAt,
			),
		).toBe(2);
		expect(
			(await createServer(svc, owner, { planId: "hetzner:cx33" })).server
				.expiresAt,
		).toBeNull();

		await expect(keepServer(svc, agent, a.server.id, null)).rejects.toThrow(
			/at most 4 hours/,
		);
		await expect(keepServer(svc, agent, a.server.id, 10)).rejects.toThrow(
			/at most 4 hours/,
		);
		expect(
			hoursLeft((await keepServer(svc, agent, a.server.id, 3)).expiresAt),
		).toBe(3);
		expect(
			(await keepServer(svc, owner, a.server.id, null)).expiresAt,
		).toBeNull();
	});

	test("a server is warned about once, then deleted when its limit passes", async () => {
		const res = await createServer(svc, owner, {
			planId: "hetzner:cx33",
			ttlHours: 1,
		});
		const at = (ms: number) => new Date(Date.now() + ms);
		await expireServers(svc, at(30 * 60_000));
		await expireServers(svc, at(31 * 60_000));
		expect(outbox.map((e) => e.subject)).toEqual([
			`${res.server.name} will be deleted in 30 minutes`,
		]);
		expect(outbox[0]?.text).toContain(
			`http://web.test/servers/${res.server.id}`,
		);

		expect(await expireServers(svc, at(61 * 60_000))).toEqual({
			warned: 0,
			deleted: 1,
		});
		const [row] = await db
			.select()
			.from(server)
			.where(eq(server.id, res.server.id));
		expect(row?.status).toBe("deleted");
		expect(outbox.at(-1)?.subject).toBe(
			`${res.server.name} was deleted after its time limit`,
		);
	});

	test("long-running servers email once, unless they have a limit or it's off", async () => {
		const forgotten = await createServer(svc, owner, {
			planId: "hetzner:cx33",
		});
		await createServer(svc, owner, { planId: "hetzner:cx33", ttlHours: 48 });
		const later = new Date(Date.now() + 25 * HOUR);
		await sendLongRunningAlerts(svc, later);
		await sendLongRunningAlerts(svc, later);
		expect(outbox.map((e) => e.subject)).toEqual([
			`${forgotten.server.name} has been running for 25 hours`,
		]);

		await updateGuardrails(db, OWNER, {
			...(await editable()),
			longRunningHours: null,
		});
		await createServer(svc, owner, { planId: "hetzner:cx33" });
		await sendLongRunningAlerts(svc, new Date(Date.now() + 100 * HOUR));
		expect(outbox).toHaveLength(1);
	});
});

describe("security", () => {
	const CHROME =
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
	const FIREFOX =
		"Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0";
	const signIn = (userAgent: string, newAccount = false) =>
		recordSignIn(svc, {
			userId: OWNER,
			action: "sign_in",
			message: "Signed in",
			ipAddress: "203.0.113.7",
			userAgent,
			newAccount,
		});

	test("a sign-in from a new device emails; known devices and sign-up don't", async () => {
		await signIn(CHROME, true);
		await signIn(CHROME);
		expect(outbox).toHaveLength(0);
		await signIn(FIREFOX);
		expect(outbox.map((e) => e.subject)).toEqual([
			"New sign-in to HessianLabs from Firefox on Linux",
		]);
		expect(outbox[0]?.text).toContain("203.0.113.7");

		await updateNotificationSettings(db, OWNER, { newSignIn: false });
		await signIn(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
		);
		expect(outbox).toHaveLength(1);
		expect(await listSecurityEvents(db, OWNER)).toHaveLength(4);
	});
});

describe("privacy", () => {
	test("deleting is blocked by running servers and by teammates", async () => {
		expect(await deletionBlockers(db, OWNER)).toEqual([]);
		const res = await createServer(svc, owner, { planId: "hetzner:cx33" });
		expect(await deletionBlockers(db, OWNER)).toEqual([
			expect.stringMatching(/1 server\(s\) still run/),
		]);
		await deleteServer(svc, owner, res.server.id);
		await joinTeam();
		expect(await deletionBlockers(db, OWNER)).toEqual([
			expect.stringMatching(/1 teammate\(s\) still use your account/),
		]);
	});

	test("the export holds the account's data but no secrets", async () => {
		const key = await createApiKey(db, OWNER, { name: "ci" });
		await createServer(svc, owner, { planId: "hetzner:cx33" });
		const [cloud] = await db.select().from(providerAccount);

		const full = JSON.stringify(await exportData(svc, owner, { id: OWNER }));
		expect(full).toContain('"email":"test@example.com"');
		expect(full).toContain('"planName"');
		expect(full).not.toContain(key.key);
		expect(full).not.toContain(cloud?.credentials as string);
		expect(full).not.toContain("tok_");

		await joinTeam();
		const asMember = await exportData(svc, mate("member"), { id: MATE });
		expect(asMember.account).toBeNull();
	});
});

describe("roles in the API", () => {
	/** Calls a route the way the dashboard does, as MATE in the owner's account. */
	async function asMate(sessionId: string) {
		const [row] = await db.select().from(user).where(eq(user.id, MATE));
		return {
			...svc,
			apiKey: null,
			session: {
				user: row,
				session: { id: sessionId, activeAccountId: OWNER },
			},
		} as unknown as Context;
	}

	test("members use the account but can't change billing, clouds or guardrails", async () => {
		const sessionId = await joinTeam("member");
		const context = await asMate(sessionId);
		expect((await call(appRouter.servers.list, {}, { context })).length).toBe(
			0,
		);
		await expect(
			call(
				appRouter.providerAccounts.connect,
				{ provider: "vultr", credentials: sandboxCredentials("vultr") },
				{ context },
			),
		).rejects.toThrow(/owner or admins/);
		await expect(
			call(appRouter.guardrails.update, await editable(), { context }),
		).rejects.toThrow(/owner or admins/);
		await expect(
			call(appRouter.credits.addTestCredits, { amountUsd: 5 }, { context }),
		).rejects.toThrow(/owner or admins/);

		const id = (await listMembers(db, OWNER)).members[0]?.id as string;
		await updateMemberRole(svc, owner, id, "admin");
		await call(appRouter.credits.addTestCredits, { amountUsd: 5 }, { context });
	});
});
