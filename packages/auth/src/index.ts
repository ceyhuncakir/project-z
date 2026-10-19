import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@switchyard/db";
import * as schema from "@switchyard/db/schema/auth";
import { betterAuth } from "better-auth";

export type AuthConfig = {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
};

export function createAuth(
	env: AuthConfig,
	database: Database,
	hooks: { onUserCreated?: (userId: string) => Promise<void> } = {},
) {
	return betterAuth({
		database: drizzleAdapter(database, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: { enabled: true },
		socialProviders:
			env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
				? {
						github: {
							clientId: env.GITHUB_CLIENT_ID,
							clientSecret: env.GITHUB_CLIENT_SECRET,
						},
					}
				: undefined,
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
