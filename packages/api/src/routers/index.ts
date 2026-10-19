import type { RouterClient } from "@orpc/server";
import {
	CONTINENTS,
	llmSizingSchema,
	PROVIDER_IDS,
	planFiltersSchema,
} from "@switchyard/cloud";
import { providerAccount, server, wallet } from "@switchyard/db/schema/app";
import { and, count, eq, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";

import {
	adminProcedure,
	publicProcedure,
	sessionProcedure,
	userProcedure,
} from "../index";
import { deletionCheck, exportData } from "../services/account-data";
import { listActivity, logActivity } from "../services/activity";
import {
	createApiKey,
	listApiKeys,
	revokeApiKey,
	serializeApiKey,
	updateApiKey,
} from "../services/api-keys";
import { burnRate } from "../services/billing";
import {
	listImages,
	listLlmModels,
	listProviders,
	listRegions,
	previewRoute,
	searchPlans,
	searchPlansInputSchema,
	sizeLlm,
} from "../services/catalog";
import {
	getGuardrails,
	guardrailsInputSchema,
	monthSpent,
	updateGuardrails,
} from "../services/guardrails";
import {
	getLowBalanceThreshold,
	getNotificationSettings,
	setLowBalanceThreshold,
	updateNotificationSettings,
} from "../services/notifications";
import {
	addTestCredits,
	createPortalSession,
	createTopupCheckout,
	getBillingDetails,
	getBillingSettings,
	removeCard,
	updateAutoTopup,
	updateBillingDetails,
} from "../services/payments";
import {
	connectProviderAccount,
	disconnectProviderAccount,
	listProviderAccounts,
} from "../services/provider-accounts";
import { listSecurityEvents } from "../services/security";
import {
	createServer,
	createServerInputSchema,
	deleteServer,
	getServer,
	keepServer,
	listServers,
	powerAction,
} from "../services/servers";
import { addSshKey, deleteSshKey, listSshKeys } from "../services/ssh-keys";
import { CLOSED } from "../services/statuses";
import {
	acceptInvitation,
	accountOwner,
	describeInvitation,
	inviteMember,
	listAccounts,
	listMembers,
	removeMember,
	revokeInvitation,
	switchAccount,
	updateMemberRole,
} from "../services/team";
import {
	ensureWallet,
	getBalance,
	listTransactions,
	quoteTopup,
	TOPUP_FEE_MIN_MICROS,
	TOPUP_FEE_PERCENT,
	TOPUP_MAX_USD,
	TOPUP_MIN_USD,
} from "../services/wallet";

const idInput = z.object({ id: z.string() });

const catalogRouter = {
	providers: publicProcedure
		.route({
			method: "GET",
			path: "/providers",
			tags: ["Catalog"],
			summary: "List providers",
		})
		.handler(({ context }) => listProviders(context)),
	regions: publicProcedure
		.route({
			method: "GET",
			path: "/regions",
			tags: ["Catalog"],
			summary: "List regions",
		})
		.input(
			z
				.object({
					providers: z.array(z.enum(PROVIDER_IDS)).optional(),
					countries: z.array(z.string().length(2)).optional(),
					continents: z.array(z.enum(CONTINENTS)).optional(),
				})
				.default({}),
		)
		.handler(({ context, input }) => listRegions(context, input)),
	plans: publicProcedure
		.route({
			method: "POST",
			path: "/plans/search",
			tags: ["Catalog"],
			summary: "Search plans across every provider",
		})
		.input(searchPlansInputSchema)
		.handler(({ context, input }) => searchPlans(context, input)),
	route: publicProcedure
		.route({
			method: "POST",
			path: "/plans/route",
			tags: ["Catalog"],
			summary: "Preview which plans the router would try, in order",
		})
		.input(z.object({ filters: planFiltersSchema.default({}) }))
		.handler(({ context, input }) => previewRoute(context, input.filters)),
	llmModels: publicProcedure
		.route({
			method: "GET",
			path: "/llm/models",
			tags: ["Catalog"],
			summary: "Open-weight model presets",
		})
		.handler(() => listLlmModels()),
	sizeLlm: publicProcedure
		.route({
			method: "POST",
			path: "/llm/size",
			tags: ["Catalog"],
			summary: "VRAM needed for a model, and the cheapest GPU plans that fit",
		})
		.input(llmSizingSchema)
		.handler(({ context, input }) => sizeLlm(context, input)),
	images: publicProcedure
		.route({
			method: "GET",
			path: "/images",
			tags: ["Catalog"],
			summary: "List OS images",
		})
		.handler(() => listImages()),
};

const serversRouter = {
	list: userProcedure
		.route({
			method: "GET",
			path: "/servers",
			tags: ["Servers"],
			summary: "List servers",
		})
		.input(
			z.object({ includeDeleted: z.coerce.boolean().optional() }).default({}),
		)
		.handler(({ context, input }) =>
			listServers(context, context.actor.userId, input),
		),
	get: userProcedure
		.route({
			method: "GET",
			path: "/servers/{id}",
			tags: ["Servers"],
			summary: "Get a server",
		})
		.input(
			idInput.extend({
				waitForRunningSeconds: z.coerce.number().min(0).max(120).optional(),
			}),
		)
		.handler(({ context, input }) =>
			getServer(context, context.actor.userId, input.id, {
				waitForRunningSeconds: input.waitForRunningSeconds,
			}),
		),
	create: userProcedure
		.route({
			method: "POST",
			path: "/servers",
			tags: ["Servers"],
			summary: "Create a server",
			description:
				"Pass `planId` for an exact plan, or `requirements` to route to the cheapest match with automatic fallback.",
		})
		.input(createServerInputSchema)
		.handler(({ context, input }) =>
			createServer(context, context.actor, input),
		),
	delete: userProcedure
		.route({
			method: "DELETE",
			path: "/servers/{id}",
			tags: ["Servers"],
			summary: "Destroy a server",
		})
		.input(idInput)
		.handler(({ context, input }) =>
			deleteServer(context, context.actor, input.id),
		),
	action: userProcedure
		.route({
			method: "POST",
			path: "/servers/{id}/actions",
			tags: ["Servers"],
			summary: "Start, stop or reboot a server",
		})
		.input(idInput.extend({ action: z.enum(["start", "stop", "reboot"]) }))
		.handler(({ context, input }) =>
			powerAction(context, context.actor, input.id, input.action),
		),
	keep: userProcedure
		.route({
			method: "POST",
			path: "/servers/{id}/keep",
			tags: ["Servers"],
			summary: "Extend or remove a server's time limit",
			description:
				"`hours` moves the time limit to that many hours from now; `null` removes it (people only, when the account limits agents).",
		})
		.input(
			idInput.extend({ hours: z.number().int().min(1).max(720).nullable() }),
		)
		.handler(({ context, input }) =>
			keepServer(context, context.actor, input.id, input.hours),
		),
};

const accountRouter = {
	overview: userProcedure
		.route({
			method: "GET",
			path: "/account",
			tags: ["Account"],
			summary: "Balance, fee burn rate and server spend",
		})
		.handler(async ({ context }) => {
			const userId = context.actor.userId;
			await ensureWallet(context.db, userId);
			const [balanceMicros, burn, [active], [accounts]] = await Promise.all([
				getBalance(context.db, userId),
				burnRate(context.db, userId),
				context.db
					.select({ n: count() })
					.from(server)
					.where(
						and(eq(server.userId, userId), notInArray(server.status, CLOSED)),
					),
				context.db
					.select({ n: count() })
					.from(providerAccount)
					.where(
						and(
							eq(providerAccount.userId, userId),
							isNull(providerAccount.error),
						),
					),
			]);
			return {
				balanceMicros,
				/** HessianLabs's fee across active servers, charged from the balance. */
				burnMicrosPerHour: burn.feeMicros,
				/** List price of active servers, billed by the providers directly. */
				serverSpendMicrosPerHour: burn.serverMicros,
				runwayHours:
					burn.feeMicros > 0
						? Math.max(0, balanceMicros / burn.feeMicros)
						: null,
				activeServers: active?.n ?? 0,
				connectedAccounts: accounts?.n ?? 0,
				apiKey: context.apiKey ? serializeApiKey(context.apiKey) : null,
			};
		}),
};

const creditsRouter = {
	transactions: userProcedure
		.route({ method: "GET", path: "/credits/transactions", tags: ["Account"] })
		.input(
			z
				.object({ limit: z.coerce.number().int().min(1).max(200).optional() })
				.default({}),
		)
		.handler(({ context, input }) =>
			listTransactions(context.db, context.actor.userId, input),
		),
	quote: publicProcedure
		.input(z.object({ amountUsd: z.number() }))
		.handler(({ input }) => quoteTopup(input.amountUsd)),
	checkout: adminProcedure
		.input(
			z.object({ amountUsd: z.number(), saveCard: z.boolean().optional() }),
		)
		.handler(async ({ context, input }) =>
			createTopupCheckout(
				context,
				await accountOwner(context.db, context.actor.userId),
				input,
			),
		),
	portal: adminProcedure.handler(async ({ context }) =>
		createPortalSession(
			context,
			await accountOwner(context.db, context.actor.userId),
		),
	),
	billing: sessionProcedure.handler(({ context }) =>
		getBillingSettings(context, context.actor.userId),
	),
	updateAutoTopup: adminProcedure
		.input(
			z.object({
				enabled: z.boolean(),
				thresholdUsd: z.number().min(0).max(1_000),
				amountUsd: z.number(),
			}),
		)
		.handler(({ context, input }) =>
			updateAutoTopup(context, context.actor, input),
		),
	removeCard: adminProcedure.handler(({ context }) =>
		removeCard(context, context.actor),
	),
	addTestCredits: adminProcedure
		.input(z.object({ amountUsd: z.number().positive().max(100) }))
		.handler(({ context, input }) =>
			addTestCredits(context, context.actor.userId, input.amountUsd),
		),
	billingDetails: sessionProcedure.handler(({ context }) =>
		getBillingDetails(context, context.actor.userId),
	),
	updateBillingDetails: adminProcedure
		.input(
			z.object({
				name: z.string().trim().max(200),
				email: z.union([z.email(), z.literal("")]),
				address: z.object({
					line1: z.string().trim().max(200),
					line2: z.string().trim().max(200),
					city: z.string().trim().max(100),
					postalCode: z.string().trim().max(20),
					state: z.string().trim().max(100),
					country: z.union([z.string().length(2), z.literal("")]),
				}),
				taxId: z.string().trim().max(40).nullable(),
			}),
		)
		.handler(async ({ context, input }) =>
			updateBillingDetails(
				context,
				await accountOwner(context.db, context.actor.userId),
				input,
			),
		),
};

/** Cloud credentials: dashboard sessions only, never API keys. */
const providerAccountsRouter = {
	list: sessionProcedure.handler(({ context }) =>
		listProviderAccounts(context, context.actor.userId),
	),
	connect: adminProcedure
		.input(
			z.object({
				provider: z.enum(PROVIDER_IDS),
				credentials: z.record(z.string(), z.string().max(1_000)),
			}),
		)
		.handler(({ context, input }) =>
			connectProviderAccount(context, context.actor, input),
		),
	disconnect: adminProcedure
		.input(idInput)
		.handler(({ context, input }) =>
			disconnectProviderAccount(context, context.actor, input.id),
		),
};

const apiKeysRouter = {
	list: sessionProcedure.handler(async ({ context }) =>
		(await listApiKeys(context.db, context.actor.userId)).map(serializeApiKey),
	),
	create: sessionProcedure
		.input(
			z.object({
				name: z.string().min(1).max(64),
				spendLimitUsd: z.number().positive().nullable().optional(),
				maxServers: z.number().int().positive().nullable().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { key, record } = await createApiKey(
				context.db,
				context.actor.userId,
				input,
			);
			return { key, apiKey: serializeApiKey(record) };
		}),
	update: sessionProcedure
		.input(
			idInput.extend({
				name: z.string().min(1).max(64).optional(),
				spendLimitUsd: z.number().positive().nullable().optional(),
				maxServers: z.number().int().positive().nullable().optional(),
			}),
		)
		.handler(async ({ context, input }) =>
			serializeApiKey(
				await updateApiKey(context.db, context.actor.userId, input.id, input),
			),
		),
	revoke: sessionProcedure
		.input(idInput)
		.handler(({ context, input }) =>
			revokeApiKey(context.db, context.actor.userId, input.id),
		),
};

const sshKeysRouter = {
	list: sessionProcedure.handler(({ context }) =>
		listSshKeys(context.db, context.actor.userId),
	),
	add: sessionProcedure
		.input(
			z.object({
				name: z.string().min(1).max(64),
				publicKey: z.string().min(20).max(16_000),
			}),
		)
		.handler(({ context, input }) =>
			addSshKey(context.db, context.actor.userId, input),
		),
	delete: sessionProcedure
		.input(idInput)
		.handler(({ context, input }) =>
			deleteSshKey(context.db, context.actor.userId, input.id),
		),
};

const activityRouter = {
	list: userProcedure
		.route({ method: "GET", path: "/activity", tags: ["Account"] })
		.input(
			z
				.object({
					limit: z.coerce.number().int().min(1).max(200).optional(),
					serverId: z.string().optional(),
				})
				.default({}),
		)
		.handler(({ context, input }) =>
			listActivity(context.db, context.actor.userId, input),
		),
};

const notificationsRouter = {
	get: sessionProcedure.handler(async ({ context }) => ({
		...(await getNotificationSettings(context.db, context.user.id)),
		lowBalanceThresholdMicros: await getLowBalanceThreshold(
			context.db,
			context.actor.userId,
		),
	})),
	update: sessionProcedure
		.input(
			z.object({
				providerProblems: z.boolean().optional(),
				autoTopupFailed: z.boolean().optional(),
				lowBalance: z.boolean().optional(),
				longRunning: z.boolean().optional(),
				serverExpiry: z.boolean().optional(),
				newSignIn: z.boolean().optional(),
			}),
		)
		.handler(({ context, input }) =>
			updateNotificationSettings(context.db, context.user.id, input),
		),
	setLowBalanceThreshold: adminProcedure
		.input(z.object({ usd: z.number().min(1).max(10_000) }))
		.handler(({ context, input }) =>
			setLowBalanceThreshold(context.db, context.actor.userId, input.usd),
		),
};

const teamRouter = {
	/** The accounts this person can act in, and which one this session uses. */
	accounts: sessionProcedure.handler(async ({ context }) => ({
		active: { accountId: context.actor.userId, role: context.actor.role },
		accounts: await listAccounts(context.db, context.user.id),
	})),
	switch: sessionProcedure
		.input(z.object({ accountId: z.string() }))
		.handler(({ context, input }) =>
			switchAccount(
				context.db,
				context.sessionId,
				context.user.id,
				input.accountId,
			),
		),
	members: sessionProcedure.handler(async ({ context }) => ({
		role: context.actor.role,
		...(await listMembers(context.db, context.actor.userId)),
	})),
	invite: adminProcedure
		.input(z.object({ email: z.email(), role: z.enum(["admin", "member"]) }))
		.handler(({ context, input }) =>
			inviteMember(context, context.actor, context.user, input),
		),
	revokeInvitation: adminProcedure
		.input(idInput)
		.handler(({ context, input }) =>
			revokeInvitation(context, context.actor, input.id),
		),
	updateRole: adminProcedure
		.input(idInput.extend({ role: z.enum(["admin", "member"]) }))
		.handler(({ context, input }) =>
			updateMemberRole(context, context.actor, input.id, input.role),
		),
	/** Admins remove anyone; members can only remove themselves (leave). */
	remove: sessionProcedure
		.input(idInput)
		.handler(({ context, input }) =>
			removeMember(context, context.actor, input.id),
		),
	invitation: publicProcedure
		.input(z.object({ token: z.string() }))
		.handler(({ context, input }) =>
			describeInvitation(context.db, input.token),
		),
	accept: sessionProcedure
		.input(z.object({ token: z.string() }))
		.handler(({ context, input }) =>
			acceptInvitation(context, context.user, context.sessionId, input.token),
		),
};

const guardrailsRouter = {
	get: sessionProcedure.handler(async ({ context }) => {
		const [w] = await context.db
			.select({
				monthSpentMicros: wallet.monthSpentMicros,
				monthStartedAt: wallet.monthStartedAt,
			})
			.from(wallet)
			.where(eq(wallet.userId, context.actor.userId));
		return {
			role: context.actor.role,
			/** Estimated provider cost of the account's servers this month. */
			monthSpentMicros: w ? monthSpent(w) : 0,
			...(await getGuardrails(context.db, context.actor.userId)),
		};
	}),
	update: adminProcedure
		.input(guardrailsInputSchema)
		.handler(async ({ context, input }) => {
			const updated = await updateGuardrails(
				context.db,
				context.actor.userId,
				input,
			);
			await logActivity(context.db, context.actor, {
				action: "guardrails.update",
				message: "Changed the agent guardrails",
			});
			return updated;
		}),
};

const privacyRouter = {
	/** Everything stored about you, and the account if you run it. */
	export: sessionProcedure.handler(({ context }) =>
		exportData(context, context.actor, context.user),
	),
	deletionCheck: sessionProcedure.handler(({ context }) =>
		deletionCheck(context.db, context.user.id),
	),
	securityEvents: sessionProcedure.handler(({ context }) =>
		listSecurityEvents(context.db, context.user.id),
	),
};

export const appRouter = {
	meta: publicProcedure.handler(({ context }) => ({
		paymentsEnabled: Boolean(context.config.stripe),
		testCreditsEnabled: context.config.allowTestCredits,
		githubAuth: context.config.githubAuth,
		/** HessianLabs's fee as a percentage of each server's list price. */
		feePercent: context.config.feeBps / 100,
		/** "sandbox" when every provider is simulated (development). */
		cloudMode: context.cloud.mode,
		connectableProviders: PROVIDER_IDS.filter((id) =>
			context.cloud.connectable(id),
		),
		mcpUrl: `${context.config.apiUrl}/mcp`,
		apiUrl: `${context.config.apiUrl}/v1`,
		topup: {
			feePercent: TOPUP_FEE_PERCENT,
			feeMinMicros: TOPUP_FEE_MIN_MICROS,
			minUsd: TOPUP_MIN_USD,
			maxUsd: TOPUP_MAX_USD,
		},
	})),
	catalog: catalogRouter,
	servers: serversRouter,
	account: accountRouter,
	credits: creditsRouter,
	providerAccounts: providerAccountsRouter,
	apiKeys: apiKeysRouter,
	sshKeys: sshKeysRouter,
	activity: activityRouter,
	notifications: notificationsRouter,
	team: teamRouter,
	guardrails: guardrailsRouter,
	privacy: privacyRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
