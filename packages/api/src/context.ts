import type { Session } from "@switchyard/auth";
import type { Cloud } from "@switchyard/cloud";
import type { Database } from "@switchyard/db";
import type { apiKey } from "@switchyard/db/schema/app";
import type Stripe from "stripe";

export interface AppConfig {
	/** Public URL of the web app. */
	webUrl: string;
	/** Public URL of the API server. */
	apiUrl: string;
	allowTestCredits: boolean;
	githubAuth: boolean;
	/** HessianLabs's fee in basis points of each server's list price (500 = 5%). */
	feeBps: number;
	/** AES-256 key that seals users' cloud credentials. */
	credentialsKey: Buffer;
	stripe: { client: Stripe; webhookSecret: string | null } | null;
}

/** Long-lived dependencies shared by RPC handlers, MCP tools and workers. */
export interface Services {
	db: Database;
	cloud: Cloud;
	config: AppConfig;
}

export type ApiKeyRecord = typeof apiKey.$inferSelect;

/** Who is acting. Agents act through API keys; people through the dashboard. */
export interface Actor {
	userId: string;
	apiKeyId: string | null;
	via: "dashboard" | "api" | "mcp" | "system";
}

export type Context = Services & {
	session: Session | null;
	apiKey: ApiKeyRecord | null;
};
