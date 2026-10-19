CREATE TYPE "team_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "guardrails" (
	"user_id" text PRIMARY KEY,
	"monthly_spend_limit_micros" bigint,
	"max_servers" integer,
	"max_hourly_price_micros" bigint,
	"allowed_providers" text[],
	"allowed_continents" text[],
	"allow_gpu" boolean DEFAULT true NOT NULL,
	"default_ttl_hours" integer,
	"long_running_hours" integer DEFAULT 24,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_event" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"message" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invitation" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" DEFAULT 'member'::"team_role" NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "team_role" DEFAULT 'member'::"team_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp
);
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "long_running" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "server_expiry" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "new_sign_in" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "expiry_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "long_running_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "low_balance_threshold_micros" bigint DEFAULT 5000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "month_spent_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "month_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_account_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "security_event_user_created_idx" ON "security_event" ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitation_account_email_idx" ON "team_invitation" ("account_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "team_member_account_user_idx" ON "team_member" ("account_id","user_id");--> statement-breakpoint
CREATE INDEX "team_member_user_idx" ON "team_member" ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "two_factor" ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "two_factor" ("user_id");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_invitation" ADD CONSTRAINT "team_invitation_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_invitation" ADD CONSTRAINT "team_invitation_invited_by_user_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_account_id_user_id_fkey" FOREIGN KEY ("active_account_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;