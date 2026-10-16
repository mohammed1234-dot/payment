import {pgTable,uuid, varchar, text,timestamp} from "drizzle-orm/pg-core";
import { timestamps } from "./helper.js";
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),    
  amount: text("amount").notNull(),   
    invoiceNumber: varchar("invoice_number", { length: 255 }).notNull(),
    description: text("description").notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    publicTokenHash: text("public_token_hash").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
    stripePaymentMethodId: text("stripe_payment_method_id").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  ...timestamps
});