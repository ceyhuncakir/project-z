import { ORPCError, os } from "@orpc/server";

import type { Actor, Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

/** Signed-in users (dashboard) or API keys (agents, scripts). */
export const userProcedure = publicProcedure.use(async ({ context, next }) => {
	if (context.session?.user) {
		const actor: Actor = {
			userId: context.session.user.id,
			apiKeyId: null,
			via: "dashboard",
		};
		return next({ context: { actor } });
	}
	if (context.apiKey) {
		const actor: Actor = {
			userId: context.apiKey.userId,
			apiKeyId: context.apiKey.id,
			via: "api",
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
		const actor: Actor = {
			userId: context.session.user.id,
			apiKeyId: null,
			via: "dashboard",
		};
		return next({ context: { actor, user: context.session.user } });
	},
);
