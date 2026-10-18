ALTER TABLE "invoices" DROP CONSTRAINT "invoices_status_valid";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_amount_positive";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_currency_format";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_status_valid";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_amount_positive";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_currency_format";--> statement-breakpoint
ALTER TABLE "webhook_events" DROP CONSTRAINT "webhook_events_status_valid";--> statement-breakpoint
DROP INDEX "users_email_lower_idx";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");