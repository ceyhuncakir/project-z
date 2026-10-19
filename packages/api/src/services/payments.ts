import { ORPCError } from "@orpc/server";
import {
	validateEvent,
	WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { formatUsd } from "@switchyard/cloud";

import type { Services } from "../context";
import { addCredits, quoteTopup } from "./wallet";

function requirePolar(svc: Services) {
	if (!svc.config.polar) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "Card payments are not configured.",
		});
	}
	return svc.config.polar;
}

/** Creates a Polar checkout for `amountUsd` of credit plus the top-up fee. */
export async function createTopupCheckout(
	svc: Services,
	user: { id: string; email: string; name: string },
	amountUsd: number,
) {
	const polar = requirePolar(svc);
	const quote = quoteTopup(amountUsd);
	const checkout = await polar.client.checkouts.create({
		products: [polar.productId],
		// Polar amounts are in cents.
		amount: Math.round(quote.totalMicros / 10_000),
		externalCustomerId: user.id,
		customerEmail: user.email,
		customerName: user.name,
		successUrl: `${svc.config.webUrl}/credits?checkout_id={CHECKOUT_ID}`,
		metadata: { userId: user.id, creditMicros: quote.creditMicros },
	});
	return { url: checkout.url, ...quote };
}

/** Customer portal for receipts and invoices. */
export async function createPortalSession(svc: Services, userId: string) {
	const polar = requirePolar(svc);
	const session = await polar.client.customerSessions.create({
		externalCustomerId: userId,
	});
	return { url: session.customerPortalUrl };
}

/**
 * Handles Polar webhooks. `order.paid` credits the wallet; the order id is the
 * idempotency key so redeliveries are harmless.
 */
export async function handlePolarWebhook(
	svc: Services,
	body: string,
	headers: Record<string, string>,
) {
	const polar = requirePolar(svc);
	if (!polar.webhookSecret) throw new Error("POLAR_WEBHOOK_SECRET is not set");
	let event: ReturnType<typeof validateEvent>;
	try {
		event = validateEvent(body, headers, polar.webhookSecret);
	} catch (err) {
		if (err instanceof WebhookVerificationError)
			return { status: 403 as const };
		throw err;
	}
	if (event.type !== "order.paid") return { status: 202 as const };

	const order = event.data;
	const userId = String(
		order.metadata?.userId ?? order.customer?.externalId ?? "",
	);
	const creditMicros = Number(order.metadata?.creditMicros ?? 0);
	if (!userId || !creditMicros) {
		console.warn(`[polar] order ${order.id} has no credit metadata; ignoring`);
		return { status: 202 as const };
	}
	const { applied } = await addCredits(svc.db, {
		userId,
		amountMicros: creditMicros,
		kind: "topup",
		description: `Credit top-up ${formatUsd(creditMicros)}`,
		externalId: `polar:${order.id}`,
		metadata: { orderId: order.id, paidCents: order.totalAmount },
	});
	return { status: 200 as const, applied };
}
