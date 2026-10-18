import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { invoices } from './invoices.schema.js';
import { timestamps } from './helper.js';
import { PaymentStatus } from './payment-status.js';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),

    stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),

    stripePaymentIntentId: text('stripe_payment_intent_id').unique(),

    amount: integer('amount').notNull(),

    currency: varchar('currency', { length: 3 }).notNull(),

    status: varchar('status', { length: 30 })
      .$type<PaymentStatus>()
      .notNull()
      .default(PaymentStatus.Pending),

    paidAt: timestamp('paid_at', { withTimezone: true }),

    refundedAt: timestamp('refunded_at', {
      withTimezone: true,
    }),

    ...timestamps,
  },
  (table) => [index('payments_invoice_id_idx').on(table.invoiceId)],
);
