import { ORPCError, os } from "@orpc/server";

import type { Actor, Context } from "./context";
import { requireRole, resolveAccount } from "./services/team";

export const o = os.$context<Context>();

export const publicProcedure = o;

/** The signed-in person, acting in the account their session points at. */
async function dashboardActor(
	context: Context,
	session: NonNullable<Context["session"]>,
): Promise<Actor> {
	const { accountId, role } = await resolveAccount(
		context.db,
		session.user.id,
		session.session.activeAccountId,
	);
	return {
		userId: accountId,
		apiKeyId: null,
		via: "dashboard",
		memberId: session.user.id,
		role,
	};
}

/** Signed-in users (dashboard) or API keys (agents, scripts). */
export const userProcedure = publicProcedure.use(async ({ context, next }) => {
	if (context.session?.user) {
		const actor = await dashboardActor(context, context.session);
		return next({ context: { actor } });
	}
	if (context.apiKey) {
		const actor: Actor = {
			userId: context.apiKey.userId,
			apiKeyId: context.apiKey.id,
			via: "api",
			memberId: null,
			role: "member",
		};
		return next({ context: { actor } });
	}
	throw new ORPCError("UNAUTHORIZED", {
		message:
			"Sign in, or send an API key as `Authorization: Bearer hl_live_…`.",
	});
});

/** Account management: dashboard sessions only, never API keys. */
export const sessionProcedure = publicProcedure.use(
	async ({ context, next }) => {
		if (!context.session?.user) throw new ORPCError("UNAUTHORIZED");
		const actor = await dashboardActor(context, context.session);
		return next({
			context: {
				actor,
				user: context.session.user,
				sessionId: context.session.session.id,
			},
		});
	},
);

/** Billing, cloud accounts, guardrails and the team: owners and admins. */
export const adminProcedure = sessionProcedure.use(({ context, next }) => {
	requireRole(context.actor, "admin", "change this");
	return next();
});
