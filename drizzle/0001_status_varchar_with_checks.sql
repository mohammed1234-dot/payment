ALTER TABLE "invoices" ALTER COLUMN "status" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "status" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "status" SET DEFAULT 'received';--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_valid" CHECK ("invoices"."status" in ('pending', 'paid', 'expired', 'cancelled'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_valid" CHECK ("payments"."status" in ('pending', 'succeeded', 'failed', 'expired', 'refunded'));--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_status_valid" CHECK ("webhook_events"."status" in ('received', 'processing', 'processed', 'failed'));--> statement-breakpoint
DROP TYPE "public"."invoice_status";--> statement-breakpoint
DROP TYPE "public"."payment_status";--> statement-breakpoint
DROP TYPE "public"."webhook_event_status";