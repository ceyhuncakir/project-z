import { ORPCError } from "@orpc/server";
import { formatUsd } from "@switchyard/cloud";
import { type Executor, newId } from "@switchyard/db";
import { wallet } from "@switchyard/db/schema/app";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import type Stripe from "stripe";

import type { Actor, Services } from "../context";
import { logActivity } from "./activity";
import { addCredits, ensureWallet, quoteTopup } from "./wallet";

/**
 * Stripe payments: hosted Checkout for top-ups (credits and fee as separate
 * line items), an optional saved card for off-session auto top-ups, refunds
 * that claw back credit, and the billing portal for receipts.
 *
 * Every credit is keyed on a Stripe object id, so webhook redeliveries and the
 * auto top-up job racing its own webhook can never double-credit.
 */

const AUTO_TOPUP_RETRY_MS = 15 * 60 * 1000;

const toCents = (micros: number) => Math.round(micros / 10_000);

/** Surfaces Stripe failures (declines, outages, bad config) as readable API errors. */
async function stripeCall<T>(what: string, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof ORPCError) throw err;
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[stripe] ${what} failed:`, message);
		throw new ORPCError("BAD_GATEWAY", { message: `Stripe: ${message}` });
	}
}

function requireStripe(svc: Services) {
	if (!svc.config.stripe) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Card payments are not configured.",
		});
	}
	return svc.config.stripe;
}

async function loadWallet(db: Executor, userId: string) {
	await ensureWallet(db, userId);
	const [row] = await db.select().from(wallet).where(eq(wallet.userId, userId));
	if (!row) throw new Error(`wallet for ${userId} missing`);
	return row;
}

/** Returns the user's Stripe customer, creating it once. */
export async function ensureCustomer(
	svc: Services,
	user: { id: string; email: string; name: string },
): Promise<string> {
	const { client } = requireStripe(svc);
	const current = await loadWallet(svc.db, user.id);
	if (current.stripeCustomerId) return current.stripeCustomerId;
	const customer = await stripeCall("create customer", () =>
		client.customers.create(
			{ email: user.email, name: user.name, metadata: { userId: user.id } },
			{ idempotencyKey: `customer:${user.id}` },
		),
	);
	// Another request may have won the race; keep whichever id landed first.
	await svc.db
		.update(wallet)
		.set({ stripeCustomerId: customer.id })
		.where(and(eq(wallet.userId, user.id), isNull(wallet.stripeCustomerId)));
	return (await loadWallet(svc.db, user.id)).stripeCustomerId ?? customer.id;
}

export async function createTopupCheckout(
	svc: Services,
	user: { id: string; email: string; name: string },
	input: { amountUsd: number; saveCard?: boolean },
) {
	const { client } = requireStripe(svc);
	const quote = quoteTopup(input.amountUsd);
	const customer = await ensureCustomer(svc, user);
	const metadata = {
		userId: user.id,
		creditMicros: String(quote.creditMicros),
		kind: "checkout",
	};
	const session = await stripeCall("create checkout", () =>
		client.checkout.sessions.create({
			mode: "payment",
			customer,
			client_reference_id: user.id,
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: "usd",
						unit_amount: toCents(quote.creditMicros),
						product_data: {
							name: "Switchyard credits",
							description: "Prepaid balance for servers on any provider",
						},
					},
				},
				{
					quantity: 1,
					price_data: {
						currency: "usd",
						unit_amount: toCents(quote.feeMicros),
						product_data: {
							name: "Top-up fee",
							description: "5% of credits, minimum $0.50",
						},
					},
				},
			],
			metadata,
			payment_intent_data: {
				metadata,
				description: `Switchyard credits ${formatUsd(quote.creditMicros)}`,
				...(input.saveCard
					? { setup_future_usage: "off_session" as const }
					: {}),
			},
			invoice_creation: { enabled: true },
			success_url: `${svc.config.webUrl}/credits?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${svc.config.webUrl}/credits?canceled=1`,
		}),
	);
	if (!session.url) throw new Error("Stripe did not return a checkout URL");
	return { url: session.url, ...quote };
}

/** Billing portal: receipts, invoices and payment methods. */
export async function createPortalSession(
	svc: Services,
	user: { id: string; email: string; name: string },
) {
	const { client } = requireStripe(svc);
	const customer = await ensureCustomer(svc, user);
	const session = await stripeCall("open billing portal", () =>
		client.billingPortal.sessions.create({
			customer,
			return_url: `${svc.config.webUrl}/credits`,
		}),
	);
	return { url: session.url };
}

export async function getBillingSettings(svc: Services, userId: string) {
	const w = await loadWallet(svc.db, userId);
	return {
		paymentsEnabled: Boolean(svc.config.stripe),
		card: w.stripePaymentMethodId
			? { brand: w.cardBrand, last4: w.cardLast4 }
			: null,
		autoTopup: {
			enabled: w.autoTopupEnabled,
			thresholdMicros: w.autoTopupThresholdMicros,
			amountMicros: w.autoTopupAmountMicros,
			error: w.autoTopupError,
		},
	};
}

export async function updateAutoTopup(
	svc: Services,
	actor: Actor,
	input: { enabled: boolean; thresholdUsd: number; amountUsd: number },
) {
	const w = await loadWallet(svc.db, actor.userId);
	if (input.enabled && !w.stripePaymentMethodId) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"Save a card first: tick “Save card for auto top-up” on your next top-up.",
		});
	}
	const amount = quoteTopup(input.amountUsd);
	if (input.thresholdUsd < 0 || input.thresholdUsd > 1_000) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Threshold must be between $0 and $1,000.",
		});
	}
	await svc.db
		.update(wallet)
		.set({
			autoTopupEnabled: input.enabled,
			autoTopupThresholdMicros: Math.round(input.thresholdUsd * 1e6),
			autoTopupAmountMicros: amount.creditMicros,
			autoTopupError: null,
		})
		.where(eq(wallet.userId, actor.userId));
	await logActivity(svc.db, actor, {
		action: "billing.auto_topup_updated",
		message: input.enabled
			? `Auto top-up on: add ${formatUsd(amount.creditMicros)} below ${formatUsd(input.thresholdUsd * 1e6)}`
			: "Auto top-up off",
	});
	return getBillingSettings(svc, actor.userId);
}

export async function removeCard(svc: Services, actor: Actor) {
	const { client } = requireStripe(svc);
	const w = await loadWallet(svc.db, actor.userId);
	if (w.stripePaymentMethodId) {
		await client.paymentMethods
			.detach(w.stripePaymentMethodId)
			.catch((err: Error) => {
				// Already detached in Stripe (e.g. via the portal) is fine.
				console.warn(
					`[stripe] detach ${w.stripePaymentMethodId}:`,
					err.message,
				);
			});
	}
	await svc.db
		.update(wallet)
		.set({
			stripePaymentMethodId: null,
			cardBrand: null,
			cardLast4: null,
			autoTopupEnabled: false,
		})
		.where(eq(wallet.userId, actor.userId));
	return getBillingSettings(svc, actor.userId);
}

/** Stores the card from a checkout that opted into future off-session use. */
async function rememberCard(
	svc: Services,
	userId: string,
	paymentIntentId: string,
) {
	const { client } = requireStripe(svc);
	const pi = await client.paymentIntents.retrieve(paymentIntentId, {
		expand: ["payment_method"],
	});
	if (pi.setup_future_usage !== "off_session" || !pi.payment_method) return;
	const pm = pi.payment_method as Stripe.PaymentMethod;
	const customer =
		typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
	if (customer) {
		await client.customers.update(customer, {
			invoice_settings: { default_payment_method: pm.id },
		});
	}
	await svc.db
		.update(wallet)
		.set({
			stripePaymentMethodId: pm.id,
			cardBrand: pm.card?.brand ?? pm.type,
			cardLast4: pm.card?.last4 ?? null,
			autoTopupError: null,
		})
		.where(eq(wallet.userId, userId));
}

function creditMetadata(metadata: Stripe.Metadata | null | undefined) {
	const userId = metadata?.userId;
	const creditMicros = Number(metadata?.creditMicros ?? 0);
	return userId && creditMicros > 0 ? { userId, creditMicros } : null;
}

async function creditCheckout(svc: Services, session: Stripe.Checkout.Session) {
	const meta = creditMetadata(session.metadata);
	if (!meta) {
		console.warn(
			`[stripe] session ${session.id} has no credit metadata; ignoring`,
		);
		return;
	}
	const { applied } = await addCredits(svc.db, {
		userId: meta.userId,
		amountMicros: meta.creditMicros,
		kind: "topup",
		description: `Card top-up ${formatUsd(meta.creditMicros)}`,
		externalId: `stripe:cs:${session.id}`,
		metadata: { sessionId: session.id, paidCents: session.amount_total },
	});
	const piId =
		typeof session.payment_intent === "string"
			? session.payment_intent
			: session.payment_intent?.id;
	if (applied && piId) await rememberCard(svc, meta.userId, piId);
}

async function creditAutoTopup(svc: Services, pi: Stripe.PaymentIntent) {
	const meta = creditMetadata(pi.metadata);
	if (!meta || pi.metadata.kind !== "auto_topup") return { applied: false };
	const result = await addCredits(svc.db, {
		userId: meta.userId,
		amountMicros: meta.creditMicros,
		kind: "topup",
		description: `Auto top-up ${formatUsd(meta.creditMicros)}`,
		externalId: `stripe:pi:${pi.id}`,
		metadata: { paymentIntentId: pi.id, paidCents: pi.amount },
	});
	await svc.db
		.update(wallet)
		.set({ autoTopupError: null })
		.where(eq(wallet.userId, meta.userId));
	return result;
}

/** Claws back credit for each refund, proportional to the share of the payment refunded. */
async function debitRefunds(svc: Services, charge: Stripe.Charge) {
	const { client } = requireStripe(svc);
	const piId =
		typeof charge.payment_intent === "string"
			? charge.payment_intent
			: charge.payment_intent?.id;
	if (!piId) return;
	const pi = await client.paymentIntents.retrieve(piId);
	const meta = creditMetadata(pi.metadata);
	if (!meta || !pi.amount) return;
	const refunds = await client.refunds.list({ charge: charge.id, limit: 100 });
	for (const refund of refunds.data) {
		if (refund.status === "failed" || refund.status === "canceled") continue;
		const debit = Math.round((meta.creditMicros * refund.amount) / pi.amount);
		await addCredits(svc.db, {
			userId: meta.userId,
			amountMicros: -debit,
			kind: "refund",
			description: `Card refund ${formatUsd(refund.amount * 10_000)}`,
			externalId: `stripe:re:${refund.id}`,
			metadata: { refundId: refund.id, chargeId: charge.id },
		});
	}
}

async function recordAutoTopupFailure(
	svc: Services,
	userId: string,
	message: string,
) {
	await svc.db
		.update(wallet)
		.set({ autoTopupEnabled: false, autoTopupError: message })
		.where(eq(wallet.userId, userId));
	await logActivity(
		svc.db,
		{ userId, apiKeyId: null, via: "system" },
		{
			action: "billing.auto_topup_failed",
			message: `Auto top-up failed and was turned off: ${message}`,
		},
	);
}

export async function handleStripeWebhook(
	svc: Services,
	body: string,
	signature: string | undefined,
): Promise<{ status: 200 | 202 | 400 }> {
	const { client, webhookSecret } = requireStripe(svc);
	if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
	let event: Stripe.Event;
	try {
		event = await client.webhooks.constructEventAsync(
			body,
			signature ?? "",
			webhookSecret,
		);
	} catch (err) {
		console.warn(
			"[stripe] webhook signature check failed:",
			(err as Error).message,
		);
		return { status: 400 };
	}

	switch (event.type) {
		case "checkout.session.completed":
		case "checkout.session.async_payment_succeeded": {
			const session = event.data.object;
			// Delayed methods (bank debits) complete later with async_payment_succeeded.
			if (session.payment_status !== "paid") return { status: 202 };
			await creditCheckout(svc, session);
			return { status: 200 };
		}
		case "payment_intent.succeeded":
			await creditAutoTopup(svc, event.data.object);
			return { status: 200 };
		case "payment_intent.payment_failed": {
			const pi = event.data.object;
			if (pi.metadata.kind === "auto_topup" && pi.metadata.userId) {
				await recordAutoTopupFailure(
					svc,
					pi.metadata.userId,
					pi.last_payment_error?.message ?? "payment failed",
				);
			}
			return { status: 200 };
		}
		case "charge.refunded":
			await debitRefunds(svc, event.data.object);
			return { status: 200 };
		default:
			return { status: 202 };
	}
}

/**
 * Charges saved cards for wallets below their auto top-up threshold. Credits
 * immediately on success (the webhook is then a no-op); a declined card turns
 * auto top-up off so we never retry a failing card in a loop.
 */
export async function runAutoTopups(svc: Services, now = new Date()) {
	if (!svc.config.stripe) return { attempted: 0 };
	const { client } = svc.config.stripe;
	const due = await svc.db
		.select()
		.from(wallet)
		.where(
			and(
				eq(wallet.autoTopupEnabled, true),
				isNotNull(wallet.stripePaymentMethodId),
				isNotNull(wallet.stripeCustomerId),
				lt(wallet.balanceMicros, wallet.autoTopupThresholdMicros),
				or(
					isNull(wallet.autoTopupLastAttemptAt),
					lt(
						wallet.autoTopupLastAttemptAt,
						new Date(now.getTime() - AUTO_TOPUP_RETRY_MS),
					),
				),
			),
		);

	let attempted = 0;
	for (const w of due) {
		// Claim the attempt so concurrent workers skip this wallet.
		const claimed = await svc.db
			.update(wallet)
			.set({ autoTopupLastAttemptAt: now })
			.where(
				and(
					eq(wallet.userId, w.userId),
					w.autoTopupLastAttemptAt
						? eq(wallet.autoTopupLastAttemptAt, w.autoTopupLastAttemptAt)
						: isNull(wallet.autoTopupLastAttemptAt),
				),
			)
			.returning({ userId: wallet.userId });
		if (!claimed.length) continue;
		attempted++;

		const quote = quoteTopup(w.autoTopupAmountMicros / 1e6);
		try {
			const pi = await client.paymentIntents.create(
				{
					amount: toCents(quote.totalMicros),
					currency: "usd",
					customer: w.stripeCustomerId as string,
					payment_method: w.stripePaymentMethodId as string,
					off_session: true,
					confirm: true,
					description: `Switchyard auto top-up ${formatUsd(quote.creditMicros)}`,
					metadata: {
						userId: w.userId,
						creditMicros: String(quote.creditMicros),
						kind: "auto_topup",
					},
				},
				{ idempotencyKey: `auto-topup:${w.userId}:${now.getTime()}` },
			);
			if (pi.status === "succeeded") {
				await creditAutoTopup(svc, pi);
				await logActivity(
					svc.db,
					{ userId: w.userId, apiKeyId: null, via: "system" },
					{
						action: "billing.auto_topup",
						message: `Auto top-up added ${formatUsd(quote.creditMicros)}`,
					},
				);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await recordAutoTopupFailure(svc, w.userId, message);
		}
	}
	return { attempted };
}

/** Test credits for development deployments. */
export async function addTestCredits(
	svc: Services,
	userId: string,
	amountUsd: number,
) {
	if (!svc.config.allowTestCredits) {
		throw new ORPCError("FORBIDDEN", { message: "Test credits are disabled" });
	}
	await addCredits(svc.db, {
		userId,
		amountMicros: Math.round(amountUsd * 1e6),
		kind: "promo",
		description: "Test credits",
		externalId: `test:${newId("tc")}`,
	});
	const [row] = await svc.db
		.select({ balance: wallet.balanceMicros })
		.from(wallet)
		.where(eq(wallet.userId, userId));
	return { balanceMicros: row?.balance ?? 0 };
}
