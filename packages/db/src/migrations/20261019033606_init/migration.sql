CREATE TYPE "credit_kind" AS ENUM('topup', 'usage', 'refund', 'adjustment', 'promo');--> statement-breakpoint
CREATE TYPE "server_status" AS ENUM('provisioning', 'running', 'stopped', 'suspended', 'deleting', 'deleted', 'error');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"server_id" text,
	"message" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL UNIQUE,
	"spend_limit_micros" bigint,
	"spent_micros" bigint DEFAULT 0 NOT NULL,
	"max_servers" integer,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transaction" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"kind" "credit_kind" NOT NULL,
	"amount_micros" bigint NOT NULL,
	"description" text NOT NULL,
	"server_id" text,
	"period_start" timestamp with time zone,
	"external_id" text UNIQUE,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"api_key_id" text,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"region_slug" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"plan_slug" text NOT NULL,
	"plan_name" text NOT NULL,
	"vcpu" integer NOT NULL,
	"memory_gb" double precision NOT NULL,
	"disk_gb" integer NOT NULL,
	"image" text NOT NULL,
	"price_hourly_micros" bigint NOT NULL,
	"status" "server_status" DEFAULT 'provisioning'::"server_status" NOT NULL,
	"provider_server_id" text,
	"ipv4" text,
	"ipv6" text,
	"sandbox" boolean DEFAULT false NOT NULL,
	"labels" jsonb DEFAULT '{}' NOT NULL,
	"error_message" text,
	"billed_until" timestamp with time zone,
	"total_cost_micros" bigint DEFAULT 0 NOT NULL,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ssh_key" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"user_id" text PRIMARY KEY,
	"balance_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_user_created_idx" ON "activity" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "api_key_user_idx" ON "api_key" ("user_id");--> statement-breakpoint
CREATE INDEX "credit_tx_user_created_idx" ON "credit_transaction" ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_tx_server_period_idx" ON "credit_transaction" ("server_id","period_start");--> statement-breakpoint
CREATE INDEX "server_user_status_idx" ON "server" ("user_id","status");--> statement-breakpoint
CREATE INDEX "server_status_idx" ON "server" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ssh_key_user_fingerprint_idx" ON "ssh_key" ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_api_key_id_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_key"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ssh_key" ADD CONSTRAINT "ssh_key_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;