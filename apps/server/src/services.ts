import type { AppConfig, Services } from "@switchyard/api/context";
import { deletionBlockers } from "@switchyard/api/services/account-data";
import { parseCredentialsKey } from "@switchyard/api/services/credentials";
import {
	logSecurityEvent,
	recordSignIn,
} from "@switchyard/api/services/security";
import { ensureWallet } from "@switchyard/api/services/wallet";
import { createAuth } from "@switchyard/auth";
import { createCloud } from "@switchyard/cloud";
import { createDb } from "@switchyard/db";
import Stripe from "stripe";

import { ENV } from "./env.server";
import { sendEmail } from "./mail";

if (ENV.CLOUD_SANDBOX_ONLY && ENV.NODE_ENV === "production") {
	// Simulated servers would still be charged a real fee.
	throw new Error("CLOUD_SANDBOX_ONLY can't be used with NODE_ENV=production");
}
if (!(ENV.PLATFORM_FEE_PERCENT >= 0 && ENV.PLATFORM_FEE_PERCENT <= 100)) {
	throw new Error("PLATFORM_FEE_PERCENT must be between 0 and 100");
}
if (!ENV.SMTP_URL && ENV.NODE_ENV === "production") {
	// Password reset and verification links would only reach the log.
	throw new Error("SMTP_URL is required with NODE_ENV=production");
}

export const db = createDb(ENV);

export const auth = createAuth(ENV, db, {
	onUserCreated: (userId) => ensureWallet(db, userId),
	sendEmail,
	// Called during requests, after `services` below exists.
	onSignIn: (event) => recordSignIn(services, event),
	onSecurityEvent: (event) => logSecurityEvent(db, event),
	deletionBlocker: async (userId) =>
		(await deletionBlockers(db, userId))[0] ?? null,
});

export const cloud = createCloud({
	sandboxOnly: ENV.CLOUD_SANDBOX_ONLY,
	eurUsdRate: ENV.EUR_USD_RATE,
	sandbox: { bootMs: ENV.SANDBOX_BOOT_SECONDS * 1000 },
	hetzner: ENV.HETZNER_API_TOKEN ? { token: ENV.HETZNER_API_TOKEN } : undefined,
	digitalocean: ENV.DIGITALOCEAN_TOKEN
		? { token: ENV.DIGITALOCEAN_TOKEN }
		: undefined,
	vultr: ENV.VULTR_API_KEY ? { apiKey: ENV.VULTR_API_KEY } : undefined,
	linode: ENV.LINODE_TOKEN ? { token: ENV.LINODE_TOKEN } : undefined,
	scaleway:
		ENV.SCW_SECRET_KEY && ENV.SCW_PROJECT_ID
			? { secretKey: ENV.SCW_SECRET_KEY, projectId: ENV.SCW_PROJECT_ID }
			: undefined,
	ovhcloud:
		ENV.OVH_ENDPOINT &&
		ENV.OVH_APPLICATION_KEY &&
		ENV.OVH_APPLICATION_SECRET &&
		ENV.OVH_CONSUMER_KEY &&
		ENV.OVH_PROJECT_ID
			? {
					endpoint: ENV.OVH_ENDPOINT,
					applicationKey: ENV.OVH_APPLICATION_KEY,
					applicationSecret: ENV.OVH_APPLICATION_SECRET,
					consumerKey: ENV.OVH_CONSUMER_KEY,
					projectId: ENV.OVH_PROJECT_ID,
				}
			: undefined,
});

const config: AppConfig = {
	webUrl: ENV.CORS_ORIGIN.replace(/\/$/, ""),
	apiUrl: ENV.BETTER_AUTH_URL.replace(/\/$/, ""),
	allowTestCredits: ENV.ALLOW_TEST_CREDITS && ENV.NODE_ENV !== "production",
	githubAuth: Boolean(ENV.GITHUB_CLIENT_ID && ENV.GITHUB_CLIENT_SECRET),
	feeBps: Math.round(ENV.PLATFORM_FEE_PERCENT * 100),
	credentialsKey: parseCredentialsKey(ENV.CREDENTIALS_KEY),
	stripe: ENV.STRIPE_SECRET_KEY
		? {
				client: new Stripe(ENV.STRIPE_SECRET_KEY, {
					// fetch works the same on Bun, Node and edge runtimes.
					httpClient: Stripe.createFetchHttpClient(),
					appInfo: { name: "hessianlabs" },
				}),
				webhookSecret: ENV.STRIPE_WEBHOOK_SECRET ?? null,
			}
		: null,
};

export const services: Services = { db, cloud, config, mail: sendEmail };
