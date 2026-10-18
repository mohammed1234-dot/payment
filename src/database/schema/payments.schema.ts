import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { invoices } from './invoices.schema.js';
import { enumValues, timestamps } from './helper.js';
import { PaymentStatus } from './payment-status.js';

/** One row per payment attempt (one Checkout Session). An invoice can have several. */
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
  (table) => [
    // Postgres does not index foreign keys on its own; serves "attempts for this invoice".
    index('payments_invoice_id_idx').on(table.invoiceId),
    check(
      'payments_status_valid',
      sql`${table.status} in (${enumValues(PaymentStatus)})`,
    ),
    check('payments_amount_positive', sql`${table.amount} > 0`),
    check('payments_currency_format', sql`${table.currency} ~ '^[a-z]{3}$'`),
  ],
);
