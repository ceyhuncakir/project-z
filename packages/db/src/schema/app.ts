import {
	bigint,
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Money columns are integer micro-USD (1 USD = 1_000_000). */
const micros = (name: string) => bigint(name, { mode: "number" });
const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const userId = () =>
	text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" });

export const wallet = pgTable("wallet", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	balanceMicros: micros("balance_micros").notNull().default(0),
	/** Stripe customer, created on first checkout. */
	stripeCustomerId: text("stripe_customer_id").unique(),
	/** Card saved for off-session auto top-ups. */
	stripePaymentMethodId: text("stripe_payment_method_id"),
	cardBrand: text("card_brand"),
	cardLast4: text("card_last4"),
	autoTopupEnabled: boolean("auto_topup_enabled").notNull().default(false),
	/** Top up when the balance drops below this. */
	autoTopupThresholdMicros: micros("auto_topup_threshold_micros")
		.notNull()
		.default(5_000_000),
	/** Credit added per auto top-up (fee charged on top). */
	autoTopupAmountMicros: micros("auto_topup_amount_micros")
		.notNull()
		.default(25_000_000),
	autoTopupLastAttemptAt: timestamp("auto_topup_last_attempt_at", {
		withTimezone: true,
	}),
	autoTopupError: text("auto_topup_error"),
	createdAt: createdAt(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const creditKind = pgEnum("credit_kind", [
	"topup",
	"usage",
	"refund",
	"adjustment",
	"promo",
]);

export const creditTransaction = pgTable(
	"credit_transaction",
	{
		id: text("id").primaryKey(),
		userId: userId(),
		kind: creditKind("kind").notNull(),
		/** Positive adds credit, negative spends it. */
		amountMicros: micros("amount_micros").notNull(),
		description: text("description").notNull(),
		serverId: text("server_id"),
		/** Usage rows are aggregated per server per hour; this is the hour. */
		periodStart: timestamp("period_start", { withTimezone: true }),
		/** Idempotency key for external events, e.g. a Stripe Checkout Session id. */
		externalId: text("external_id").unique(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: createdAt(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index("credit_tx_user_created_idx").on(t.userId, t.createdAt),
		uniqueIndex("credit_tx_server_period_idx").on(t.serverId, t.periodStart),
	],
);

export const apiKey = pgTable(
	"api_key",
	{
		id: text("id").primaryKey(),
		userId: userId(),
		name: text("name").notNull(),
		/** First characters of the key, safe to display. */
		prefix: text("prefix").notNull(),
		/** SHA-256 of the full key. The key itself is never stored. */
		hash: text("hash").notNull().unique(),
		/** Lifetime spend cap for servers created with this key. Null = no cap. */
		spendLimitMicros: micros("spend_limit_micros"),
		spentMicros: micros("spent_micros").notNull().default(0),
		/** Max concurrently active servers created with this key. Null = no cap. */
		maxServers: integer("max_servers"),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [index("api_key_user_idx").on(t.userId)],
);

export const sshKey = pgTable(
	"ssh_key",
	{
		id: text("id").primaryKey(),
		userId: userId(),
		name: text("name").notNull(),
		publicKey: text("public_key").notNull(),
		fingerprint: text("fingerprint").notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("ssh_key_user_fingerprint_idx").on(t.userId, t.fingerprint),
	],
);

/**
 * A user's own cloud account. Servers are created there, so the provider
 * bills the user directly; HessianLabs only charges its fee.
 */
export const providerAccount = pgTable(
	"provider_account",
	{
		id: text("id").primaryKey(),
		userId: userId(),
		provider: text("provider").notNull(),
		/** AES-256-GCM sealed JSON credentials. Never leaves the API server. */
		credentials: text("credentials").notNull(),
		/** Last characters of the main secret, safe to display. */
		hint: text("hint").notNull(),
		/** Why the provider stopped accepting the credentials. Null while they work. */
		error: text("error"),
		verifiedAt: timestamp("verified_at", { withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		uniqueIndex("provider_account_user_provider_idx").on(t.userId, t.provider),
	],
);

export const serverStatus = pgEnum("server_status", [
	"provisioning",
	"running",
	"stopped",
	"suspended",
	"deleting",
	"deleted",
	"error",
	/** No longer managed: its account was disconnected or its credentials stopped working. */
	"detached",
]);

export const server = pgTable(
	"server",
	{
		id: text("id").primaryKey(),
		userId: userId(),
		apiKeyId: text("api_key_id").references(() => apiKey.id, {
			onDelete: "set null",
		}),
		providerAccountId: text("provider_account_id").references(
			() => providerAccount.id,
			{ onDelete: "set null" },
		),
		name: text("name").notNull(),
		provider: text("provider").notNull(),
		regionSlug: text("region_slug").notNull(),
		city: text("city").notNull(),
		country: text("country").notNull(),
		planSlug: text("plan_slug").notNull(),
		planName: text("plan_name").notNull(),
		vcpu: integer("vcpu").notNull(),
		memoryGb: doublePrecision("memory_gb").notNull(),
		diskGb: integer("disk_gb").notNull(),
		/** e.g. "2× A100 80GB, 160 GB VRAM"; null on CPU-only plans. */
		gpu: text("gpu"),
		image: text("image").notNull(),
		/** Provider list price. The provider bills this to the user directly. */
		priceHourlyMicros: micros("price_hourly_micros").notNull(),
		/** HessianLabs's fee, fixed when the server is created. Charged from the balance. */
		feeHourlyMicros: micros("fee_hourly_micros").notNull().default(0),
		status: serverStatus("status").notNull().default("provisioning"),
		providerServerId: text("provider_server_id"),
		ipv4: text("ipv4"),
		ipv6: text("ipv6"),
		sandbox: boolean("sandbox").notNull().default(false),
		labels: jsonb("labels")
			.$type<Record<string, string>>()
			.notNull()
			.default({}),
		errorMessage: text("error_message"),
		/** Usage has been charged up to this instant. Null until the provider accepts the order. */
		billedUntil: timestamp("billed_until", { withTimezone: true }),
		/** Estimated provider cost so far, at list price. */
		totalCostMicros: micros("total_cost_micros").notNull().default(0),
		totalFeeMicros: micros("total_fee_micros").notNull().default(0),
		/** Last time the provider was asked about this server. */
		syncedAt: timestamp("synced_at", { withTimezone: true }),
		suspendedAt: timestamp("suspended_at", { withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(t) => [
		index("server_user_status_idx").on(t.userId, t.status),
		index("server_status_idx").on(t.status),
	],
);

export const activity = pgTable(
	"activity",
	{
		id: text("id").primaryKey(),
		userId: userId(),
		apiKeyId: text("api_key_id"),
		/** dashboard | api | mcp | system */
		actor: text("actor").notNull(),
		action: text("action").notNull(),
		serverId: text("server_id"),
		message: text("message").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: createdAt(),
	},
	(t) => [index("activity_user_created_idx").on(t.userId, t.createdAt)],
);
