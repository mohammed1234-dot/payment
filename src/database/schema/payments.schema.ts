import {pgTable, serial, text, varchar,timestamp} from 'drizzle-orm/pg-core';
import {timestamps} from './helper.js';
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  invoiceId: text('invoice_id').notNull(),  
  stripePaymentIntentId: text('stripe_payment_intent_id').notNull(),
    stripePaymentMethodId: text('stripe_payment_method_id').notNull(),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').notNull(),
    amount: text('amount').notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
  ...timestamps
})