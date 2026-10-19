ALTER TABLE "server" ADD COLUMN "gpu" text;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "stripe_payment_method_id" text;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "card_brand" text;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "card_last4" text;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "auto_topup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "auto_topup_threshold_micros" bigint DEFAULT 5000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "auto_topup_amount_micros" bigint DEFAULT 25000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "auto_topup_last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet" ADD COLUMN "auto_topup_error" text;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_stripe_customer_id_key" UNIQUE("stripe_customer_id");