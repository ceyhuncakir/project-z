import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";

import { createCloud } from "@switchyard/cloud";
import { wallet } from "@switchyard/db/schema/app";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

import type { Actor, Services } from "./context";
import {
	createTopupCheckout,
	handleStripeWebhook,
	runAutoTopups,
	updateAutoTopup,
} from "./services/payments";
import { getBalance } from "./services/wallet";
import {
	createTestDb,
	prepareDatabase,
	resetDatabase,
	TEST_USER,
} from "./testing";

/**
 * Exercises the Stripe integration end to end except for the network: the
 * real SDK verifies webhook signatures, while API calls hit recorded fakes.
 */

const db = createTestDb();
const WEBHOOK_SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_fake", {
	httpClient: Stripe.createFetchHttpClient(),
});

const calls: Record<string, unknown[][]> = {};
/** First argument of the first recorded call to `name`. */
function firstArg<T>(name: string): T {
	const call = calls[name]?.[0];
	if (!call) throw new Error(`${name} was not called`);
	return call[0] as T;
}
function fake<T>(name: string, impl: (...args: never[]) => T) {
	return async (...args: never[]) => {
		const list = calls[name] ?? [];
		list.push(args);
		calls[name] = list;
		return impl(...args);
	};
}

let piCreate: (...args: never[]) => unknown = () => ({});
let piRetrieve: (...args: never[]) => unknown = () => ({});
Object.assign(stripe.customers, {
	create: fake("customers.create", () => ({ id: "cus_123" })),
	update: fake("customers.update", () => ({ id: "cus_123" })),
});
Object.assign(stripe.checkout.sessions, {
	create: fake("checkout.sessions.create", () => ({
		id: "cs_123",
		url: "https://checkout.stripe.test/cs_123",
	})),
});
Object.assign(stripe.paymentIntents, {
	create: fake("paymentIntents.create", (...args) => piCreate(...args)),
	retrieve: fake("paymentIntents.retrieve", (...args) => piRetrieve(...args)),
});
Object.assign(stripe.refunds, {
	list: fake("refunds.list", () => ({
		data: [{ id: "re_1", amount: 2625, status: "succeeded" }],
	})),
});

const svc: Services = {
	db,
	cloud: createCloud({ sandboxOnly: true }),
	config: {
		webUrl: "http://web.test",
		apiUrl: "http://api.test",
		allowTestCredits: false,
		githubAuth: false,
		stripe: { client: stripe, webhookSecret: WEBHOOK_SECRET },
	},
};

const user = { id: TEST_USER, email: "test@example.com", name: "Test" };
const actor: Actor = { userId: TEST_USER, apiKeyId: null, via: "dashboard" };

async function deliver(
	type: string,
	object: Record<string, unknown>,
	secret = WEBHOOK_SECRET,
) {
	const payload = JSON.stringify({
		id: `evt_${crypto.randomUUID()}`,
		object: "event",
		api_version: Stripe.API_VERSION,
		created: Math.floor(Date.now() / 1000),
		type,
		data: { object },
	});
	const signature = await stripe.webhooks.generateTestHeaderStringAsync({
		payload,
		secret,
	});
	return handleStripeWebhook(svc, payload, signature);
}

const paidSession = {
	id: "cs_123",
	object: "checkout.session",
	payment_status: "paid",
	payment_intent: "pi_checkout",
	amount_total: 5250,
	metadata: { userId: TEST_USER, creditMicros: "50000000", kind: "checkout" },
};

beforeAll(() => prepareDatabase(db));
beforeEach(async () => {
	await resetDatabase(db);
	for (const k of Object.keys(calls)) delete calls[k];
	piRetrieve = () => ({
		id: "pi_checkout",
		setup_future_usage: null,
		metadata: paidSession.metadata,
	});
});
afterAll(() => db.$client.end());

describe("checkout", () => {
	test("bills credits and the fee as separate line items, reusing one customer", async () => {
		const res = await createTopupCheckout(svc, user, {
			amountUsd: 50,
			saveCard: true,
		});
		await createTopupCheckout(svc, user, { amountUsd: 10 });
		expect(res.url).toContain("checkout.stripe.test");
		expect(calls["customers.create"]).toHaveLength(1);

		const params = firstArg<Stripe.Checkout.SessionCreateParams>(
			"checkout.sessions.create",
		);
		expect(params.mode).toBe("payment");
		expect(params.customer).toBe("cus_123");
		expect(params.line_items?.map((l) => l.price_data?.unit_amount)).toEqual([
			5000, 250,
		]);
		expect(params.metadata?.creditMicros).toBe("50000000");
		expect(params.payment_intent_data?.setup_future_usage).toBe("off_session");
		expect(params.success_url).toContain("{CHECKOUT_SESSION_ID}");
	});
});

describe("webhooks", () => {
	test("credits a paid checkout exactly once", async () => {
		expect(
			(await deliver("checkout.session.completed", paidSession)).status,
		).toBe(200);
		expect(
			(await deliver("checkout.session.completed", paidSession)).status,
		).toBe(200);
		expect(await getBalance(db, TEST_USER)).toBe(50_000_000);
	});

	test("rejects bad signatures and waits for delayed payments", async () => {
		expect(
			(await deliver("checkout.session.completed", paidSession, "whsec_wrong"))
				.status,
		).toBe(400);
		expect(
			(
				await deliver("checkout.session.completed", {
					...paidSession,
					payment_status: "unpaid",
				})
			).status,
		).toBe(202);
		expect(await getBalance(db, TEST_USER)).toBe(0);
		await deliver("checkout.session.async_payment_succeeded", paidSession);
		expect(await getBalance(db, TEST_USER)).toBe(50_000_000);
	});

	test("saves the card when the customer opted in", async () => {
		piRetrieve = () => ({
			id: "pi_checkout",
			setup_future_usage: "off_session",
			customer: "cus_123",
			payment_method: {
				id: "pm_visa",
				type: "card",
				card: { brand: "visa", last4: "4242" },
			},
		});
		await deliver("checkout.session.completed", paidSession);
		const [w] = await db
			.select()
			.from(wallet)
			.where(eq(wallet.userId, TEST_USER));
		expect(w?.stripePaymentMethodId).toBe("pm_visa");
		expect(w?.cardLast4).toBe("4242");
		expect(calls["customers.update"]).toHaveLength(1);
	});

	test("claws back credit proportionally on refunds", async () => {
		await deliver("checkout.session.completed", paidSession);
		piRetrieve = () => ({
			id: "pi_checkout",
			amount: 5250,
			metadata: paidSession.metadata,
		});
		// Refund of $26.25 out of $52.50 → half the credits.
		await deliver("charge.refunded", {
			id: "ch_1",
			object: "charge",
			payment_intent: "pi_checkout",
		});
		await deliver("charge.refunded", {
			id: "ch_1",
			object: "charge",
			payment_intent: "pi_checkout",
		});
		expect(await getBalance(db, TEST_USER)).toBe(25_000_000);
	});
});

describe("auto top-up", () => {
	async function saveCard() {
		await db
			.update(wallet)
			.set({
				stripeCustomerId: "cus_123",
				stripePaymentMethodId: "pm_visa",
				cardLast4: "4242",
			})
			.where(eq(wallet.userId, TEST_USER));
		await updateAutoTopup(svc, actor, {
			enabled: true,
			thresholdUsd: 5,
			amountUsd: 25,
		});
	}

	test("charges the saved card off-session and credits once", async () => {
		await saveCard();
		piCreate = (params) => ({
			id: "pi_auto",
			status: "succeeded",
			amount: (params as Stripe.PaymentIntentCreateParams).amount,
			metadata: (params as Stripe.PaymentIntentCreateParams).metadata,
		});
		expect((await runAutoTopups(svc)).attempted).toBe(1);
		const params = firstArg<Stripe.PaymentIntentCreateParams>(
			"paymentIntents.create",
		);
		expect(params.amount).toBe(2625);
		expect(params.off_session).toBe(true);
		expect(await getBalance(db, TEST_USER)).toBe(25_000_000);

		// The webhook for the same PaymentIntent must not credit again.
		await deliver("payment_intent.succeeded", {
			id: "pi_auto",
			object: "payment_intent",
			metadata: params.metadata,
		});
		expect(await getBalance(db, TEST_USER)).toBe(25_000_000);
		// Balance is above threshold now, and the attempt window is still closed.
		expect((await runAutoTopups(svc)).attempted).toBe(0);
	});

	test("turns itself off when the card is declined", async () => {
		await saveCard();
		piCreate = () => {
			throw new Error("Your card was declined.");
		};
		await runAutoTopups(svc);
		const [w] = await db
			.select()
			.from(wallet)
			.where(eq(wallet.userId, TEST_USER));
		expect(w?.autoTopupEnabled).toBe(false);
		expect(w?.autoTopupError).toContain("declined");
	});

	test("cannot be enabled without a saved card", async () => {
		await expect(
			updateAutoTopup(svc, actor, {
				enabled: true,
				thresholdUsd: 5,
				amountUsd: 25,
			}),
		).rejects.toThrow(/Save a card/);
	});
});
