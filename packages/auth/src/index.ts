import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@switchyard/db";
import * as schema from "@switchyard/db/schema/auth";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
	isAPIError,
} from "better-auth/api";
import { twoFactor } from "better-auth/plugins";

export type AuthConfig = {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
};

export type AuthEmail = { to: string; subject: string; text: string };

export type SecurityEvent = {
	userId: string;
	action: string;
	message: string;
	ipAddress?: string | null;
	userAgent?: string | null;
};

type AuthHooks = {
	onUserCreated?: (userId: string) => Promise<void>;
	sendEmail: (email: AuthEmail) => Promise<void>;
	/** A finished sign-in, once any two-factor check has passed. */
	onSignIn?: (event: SecurityEvent & { newAccount: boolean }) => Promise<void>;
	onSecurityEvent?: (event: SecurityEvent) => Promise<void>;
	/** Why this user can't be deleted yet, or null when they can. */
	deletionBlocker?: (userId: string) => Promise<string | null>;
};

/** Changes to how someone signs in, logged when the request succeeds. */
const SECURITY_PATHS: Record<string, [action: string, message: string]> = {
	"/change-password": ["password.change", "Changed the password"],
	"/two-factor/disable": ["two_factor.disable", "Turned two-factor login off"],
	"/two-factor/generate-backup-codes": [
		"two_factor.backup_codes",
		"Generated new backup codes; the old ones stopped working",
	],
	"/revoke-session": ["session.revoke", "Signed out a session"],
	"/revoke-other-sessions": [
		"session.revoke_others",
		"Signed out everywhere else",
	],
	"/unlink-account": ["account.unlink", "Disconnected a sign-in method"],
	"/delete-user": [
		"account.delete_requested",
		"Asked to delete the account; a confirmation link was emailed",
	],
};

/** Requests that end in a new session for someone who wasn't signed in. */
const SIGN_IN_PATHS = new Set([
	"/sign-in/email",
	"/sign-up/email",
	"/callback/:id",
	"/verify-email",
	"/two-factor/verify-totp",
	"/two-factor/verify-backup-code",
	"/two-factor/verify-otp",
]);

/**
 * Feeds the security log. Listed after the two-factor plugin so it runs
 * after it: a password sign-in that still needs a code has no session yet.
 */
function securityLog(hooks: AuthHooks): BetterAuthPlugin {
	return {
		id: "security-log",
		hooks: {
			after: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						if (isAPIError(ctx.context.returned)) return;
						const fresh = ctx.context.newSession;
						const twoFactorCookie = ctx.context.createAuthCookie("two_factor");
						const finishingTwoFactor = Boolean(
							await ctx.getSignedCookie(
								twoFactorCookie.name,
								ctx.context.secret,
							),
						);

						// Verifying a code with a session (not a two-factor cookie) turns it on.
						if (ctx.path === "/two-factor/verify-totp" && !finishingTwoFactor) {
							const current =
								fresh ?? (await getSessionFromCtx(ctx).catch(() => null));
							if (current)
								await hooks.onSecurityEvent?.({
									userId: current.user.id,
									action: "two_factor.enable",
									message: "Turned two-factor login on",
									ipAddress: current.session.ipAddress,
									userAgent: current.session.userAgent,
								});
							return;
						}

						if (fresh && SIGN_IN_PATHS.has(ctx.path)) {
							await hooks.onSignIn?.({
								userId: fresh.user.id,
								action: "sign_in",
								message:
									ctx.path === "/sign-up/email"
										? "Created the account and signed in"
										: ctx.path === "/callback/:id"
											? "Signed in with GitHub"
											: ctx.path === "/verify-email"
												? "Signed in from an email verification link"
												: "Signed in",
								ipAddress: fresh.session.ipAddress,
								userAgent: fresh.session.userAgent,
								newAccount: ctx.path === "/sign-up/email",
							});
							return;
						}

						const event = SECURITY_PATHS[ctx.path];
						if (!event) return;
						// Changing the password can replace the session the request came with.
						const current =
							ctx.context.session ??
							fresh ??
							(await getSessionFromCtx(ctx).catch(() => null));
						if (!current) return;
						await hooks.onSecurityEvent?.({
							userId: current.user.id,
							action: event[0],
							message: event[1],
							ipAddress: current.session.ipAddress,
							userAgent: current.session.userAgent,
						});
					}),
				},
			],
		},
	};
}

export function createAuth(
	env: AuthConfig,
	database: Database,
	hooks: AuthHooks,
) {
	// Not awaited: a failing mail server shouldn't fail sign-up, and response
	// times shouldn't reveal whether an address has an account.
	const send = async (email: AuthEmail) => {
		hooks
			.sendEmail(email)
			.catch((e) => console.error(`Couldn't email ${email.to}`, e));
	};

	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: true,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: ({ user, url }) =>
				send({
					to: user.email,
					subject: "Reset your HessianLabs password",
					text: `Someone asked to reset the password for ${user.email}. Choose a new one here; the link works for an hour:\n\n${url}\n\nIf that wasn't you, ignore this email and your password stays the same.`,
				}),
			onPasswordReset: async ({ user }) => {
				await hooks.onSecurityEvent?.({
					userId: user.id,
					action: "password.reset",
					message: "Reset the password with an emailed link",
				});
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: ({ user, url }) =>
				send({
					to: user.email,
					subject: "Verify your email for HessianLabs",
					text: `Confirm that ${user.email} is yours; the link works for an hour:\n\n${url}`,
				}),
			afterEmailVerification: async (user) => {
				await hooks.onSecurityEvent?.({
					userId: user.id,
					action: "email.verify",
					message: `Verified ${user.email}`,
				});
			},
		},
		user: {
			changeEmail: {
				enabled: true,
				// A verified address approves the change from its own inbox first;
				// the new address then gets a verification link.
				sendChangeEmailConfirmation: ({ user, newEmail, url }) =>
					send({
						to: user.email,
						subject: "Approve your new HessianLabs email",
						text: `Someone asked to change your HessianLabs email from ${user.email} to ${newEmail}. Approve it here; the link works for an hour:\n\n${url}\n\nIf that wasn't you, ignore this email and change your password.`,
					}),
			},
			deleteUser: {
				enabled: true,
				deleteTokenExpiresIn: 86_400,
				// Deleting always goes through the inbox, password or not.
				sendDeleteAccountVerification: ({ user, url }) =>
					send({
						to: user.email,
						subject: "Confirm deleting your HessianLabs account",
						text: `Someone asked to delete the HessianLabs account for ${user.email}. This removes your profile, API keys, saved cloud credentials, credit balance and history for good. Confirm here; the link works for a day:\n\n${url}\n\nIf that wasn't you, ignore this email and change your password.`,
					}),
				beforeDelete: async (user) => {
					const blocker = await hooks.deletionBlocker?.(user.id);
					if (blocker) throw new APIError("BAD_REQUEST", { message: blocker });
				},
			},
		},
		session: {
			additionalFields: {
				/** Set by the API's account switcher, never by the client directly. */
				activeAccountId: { type: "string", required: false, input: false },
			},
		},
		socialProviders:
			env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
				? {
						github: {
							clientId: env.GITHUB_CLIENT_ID,
							clientSecret: env.GITHUB_CLIENT_SECRET,
						},
					}
				: undefined,
		plugins: [twoFactor({ issuer: "HessianLabs" }), securityLog(hooks)],
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						await hooks.onUserCreated?.(user.id);
					},
				},
			},
		},
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
