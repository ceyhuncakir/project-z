import { z } from "zod";

import type { LiveProviderId } from "./types";

/**
 * What a user pastes to connect their own cloud account. Servers are created
 * in that account, so the provider bills the user directly.
 */

const secret = z.string().trim().min(8).max(1_000);

export const providerCredentialsSchemas = {
	hetzner: z.object({ token: secret }),
	digitalocean: z.object({ token: secret }),
	vultr: z.object({ apiKey: secret }),
	linode: z.object({ token: secret }),
	scaleway: z.object({ secretKey: secret, projectId: z.uuid() }),
	ovhcloud: z.object({
		endpoint: z.enum(["ovh-eu", "ovh-ca", "ovh-us"]),
		applicationKey: secret,
		applicationSecret: secret,
		consumerKey: secret,
		projectId: z.string().trim().min(1).max(100),
	}),
} satisfies Record<LiveProviderId, z.ZodType>;

export type ProviderCredentials = {
	[P in LiveProviderId]: z.infer<(typeof providerCredentialsSchemas)[P]>;
};

/** The field whose last characters identify a connected account in the UI. */
export const CREDENTIAL_HINT_FIELD = {
	hetzner: "token",
	digitalocean: "token",
	vultr: "apiKey",
	linode: "token",
	scaleway: "secretKey",
	ovhcloud: "consumerKey",
} as const satisfies {
	[P in LiveProviderId]: keyof ProviderCredentials[P];
};
