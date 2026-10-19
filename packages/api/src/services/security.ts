import { type Executor, newId } from "@switchyard/db";
import { securityEvent } from "@switchyard/db/schema/app";
import { and, desc, eq } from "drizzle-orm";

import type { Services } from "../context";
import { notifyUser } from "./notifications";

type Event = {
	userId: string;
	action: string;
	message: string;
	ipAddress?: string | null;
	userAgent?: string | null;
};

export async function logSecurityEvent(db: Executor, event: Event) {
	await db.insert(securityEvent).values({
		id: newId("sec"),
		userId: event.userId,
		action: event.action,
		message: event.message,
		ipAddress: event.ipAddress ?? null,
		userAgent: event.userAgent ?? null,
	});
}

export async function listSecurityEvents(db: Executor, userId: string) {
	return db
		.select()
		.from(securityEvent)
		.where(eq(securityEvent.userId, userId))
		.orderBy(desc(securityEvent.createdAt))
		.limit(100);
}

/**
 * Logs a sign-in and emails the user when it came from a browser or device
 * they haven't signed in from before. Creating the account doesn't email.
 */
export async function recordSignIn(
	svc: Services,
	event: Event & { newAccount: boolean },
) {
	const previous = await svc.db
		.select({ userAgent: securityEvent.userAgent })
		.from(securityEvent)
		.where(
			and(
				eq(securityEvent.userId, event.userId),
				eq(securityEvent.action, "sign_in"),
			),
		);
	await logSecurityEvent(svc.db, event);
	const device = describeAgent(event.userAgent);
	const seen = previous.some((p) => describeAgent(p.userAgent) === device);
	if (event.newAccount || seen) return;
	await notifyUser(svc, event.userId, "newSignIn", {
		subject: `New sign-in to HessianLabs from ${device}`,
		text: `Someone signed in to your HessianLabs account from ${device}${event.ipAddress ? ` (IP ${event.ipAddress})` : ""} at ${new Date().toUTCString()}.\n\nIf that was you, there's nothing to do. If it wasn't, change your password and sign out the session: ${svc.config.webUrl}/settings/sessions`,
	});
}

/** "Firefox on Linux" from a user agent; other clients fall back to the raw string. */
export function describeAgent(ua?: string | null): string {
	if (!ua) return "an unknown device";
	const browser = /Edg\//.test(ua)
		? "Edge"
		: /Firefox\//.test(ua)
			? "Firefox"
			: /Chrome\//.test(ua)
				? "Chrome"
				: /Safari\//.test(ua)
					? "Safari"
					: null;
	// iOS agents mention Mac OS X and Android ones mention Linux, so check those first.
	const os = /iPhone|iPad/.test(ua)
		? "iOS"
		: /Android/.test(ua)
			? "Android"
			: /Mac OS X/.test(ua)
				? "macOS"
				: /Windows/.test(ua)
					? "Windows"
					: /Linux/.test(ua)
						? "Linux"
						: null;
	if (browser && os) return `${browser} on ${os}`;
	return browser ?? os ?? ua.slice(0, 60);
}
