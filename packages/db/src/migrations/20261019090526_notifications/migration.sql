CREATE TABLE "notification_settings" (
	"user_id" text PRIMARY KEY,
	"provider_problems" boolean DEFAULT true NOT NULL,
	"auto_topup_failed" boolean DEFAULT true NOT NULL,
	"low_balance" boolean DEFAULT true NOT NULL,
	"low_balance_threshold_micros" bigint DEFAULT 5000000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "low_balance_alert_armed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;