import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema.js';
import { enumValues, timestamps } from './helper.js';
import { InvoiceStatus } from './invoice-status.js';

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Restrict: a user who has invoices cannot be deleted by accident.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    invoiceNumber: varchar('invoice_number', {
      length: 50,
    })
      .notNull()
      .unique(),

    description: text('description').notNull(),

    /** In the currency's smallest unit (cents for usd). */
    amount: integer('amount').notNull(),

    /** Lowercase ISO 4217 code, as Stripe uses it (usd, eur, egp). */
    currency: varchar('currency', { length: 3 }).notNull(),

    status: varchar('status', { length: 30 })
      .$type<InvoiceStatus>()
      .notNull()
      .default(InvoiceStatus.Pending),

    /** SHA-256 of the public link's token. The token itself is never stored. */
    publicTokenHash: text('public_token_hash').notNull(),

    /** The Checkout Session currently offered to the payer, reused while it is still open. */
    stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),

    expiresAt: timestamp('expires_at', {
      withTimezone: true,
    }),

    paidAt: timestamp('paid_at', {
      withTimezone: true,
    }),

    ...timestamps,
  },
  (table) => [
    // Serves "my invoices, newest first".
    index('invoices_user_id_created_at_idx').on(table.userId, table.createdAt),
    uniqueIndex('invoices_public_token_hash_idx').on(table.publicTokenHash),
    check(
      'invoices_status_valid',
      sql`${table.status} in (${enumValues(InvoiceStatus)})`,
    ),
    check('invoices_amount_positive', sql`${table.amount} > 0`),
    check('invoices_currency_format', sql`${table.currency} ~ '^[a-z]{3}$'`),
  ],
);
