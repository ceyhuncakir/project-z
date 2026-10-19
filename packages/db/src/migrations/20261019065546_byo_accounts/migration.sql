ALTER TYPE "server_status" ADD VALUE 'detached';--> statement-breakpoint
CREATE TABLE "provider_account" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"credentials" text NOT NULL,
	"hint" text NOT NULL,
	"error" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "provider_account_id" text;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "fee_hourly_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "total_fee_micros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_account_user_provider_idx" ON "provider_account" ("user_id","provider");--> statement-breakpoint
ALTER TABLE "provider_account" ADD CONSTRAINT "provider_account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_provider_account_id_provider_account_id_fkey" FOREIGN KEY ("provider_account_id") REFERENCES "provider_account"("id") ON DELETE SET NULL;