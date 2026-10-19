-- The threshold belongs to the account now: keep each owner's choice.
UPDATE "wallet" SET "low_balance_threshold_micros" = "notification_settings"."low_balance_threshold_micros" FROM "notification_settings" WHERE "notification_settings"."user_id" = "wallet"."user_id";--> statement-breakpoint
ALTER TABLE "notification_settings" DROP COLUMN "low_balance_threshold_micros";
