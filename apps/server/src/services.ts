import { Polar } from "@polar-sh/sdk";
import type { AppConfig, Services } from "@switchyard/api/context";
import { ensureWallet } from "@switchyard/api/services/wallet";
import { createAuth } from "@switchyard/auth";
import { createCloud } from "@switchyard/cloud";
import { createDb } from "@switchyard/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);

export const auth = createAuth(ENV, db, {
	onUserCreated: (userId) => ensureWallet(db, userId),
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
	polar:
		ENV.POLAR_ACCESS_TOKEN && ENV.POLAR_CREDITS_PRODUCT_ID
			? {
					client: new Polar({
						accessToken: ENV.POLAR_ACCESS_TOKEN,
						server: ENV.POLAR_SERVER,
					}),
					productId: ENV.POLAR_CREDITS_PRODUCT_ID,
					webhookSecret: ENV.POLAR_WEBHOOK_SECRET ?? null,
				}
			: null,
};

export const services: Services = { db, cloud, config };
