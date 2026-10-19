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

export interface Email {
	to: string;
	subject: string;
	text: string;
}

/** Long-lived dependencies shared by RPC handlers, MCP tools and workers. */
export interface Services {
	db: Database;
	cloud: Cloud;
	config: AppConfig;
	mail: (email: Email) => Promise<void>;
}

export type ApiKeyRecord = typeof apiKey.$inferSelect;

/** "owner" is the account's own user; the rest come from team_member. */
export type Role = "owner" | "admin" | "member";

/** Who is acting. Agents act through API keys; people through the dashboard. */
export interface Actor {
	/** The account acted in: its owner's user id. Everything is scoped to it. */
	userId: string;
	apiKeyId: string | null;
	via: "dashboard" | "api" | "mcp" | "system";
	/** The person in the dashboard, who may be a teammate of the owner. */
	memberId?: string | null;
	/** Set on every request; API keys act as members. */
	role?: Role;
}

export type Context = Services & {
	session: Session | null;
	apiKey: ApiKeyRecord | null;
};
