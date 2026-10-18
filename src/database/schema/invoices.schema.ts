import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema.js';
import { timestamps } from './helper.js';
import { InvoiceStatus } from './invoice-status.js';

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    invoiceNumber: varchar('invoice_number', {
      length: 50,
    })
      .notNull()
      .unique(),

    description: text('description').notNull(),

    amount: integer('amount').notNull(),

    currency: varchar('currency', { length: 3 }).notNull(),

    status: varchar('status', { length: 30 })
      .$type<InvoiceStatus>()
      .notNull()
      .default(InvoiceStatus.Pending),

    publicTokenHash: text('public_token_hash').notNull(),

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
    index('invoices_user_id_created_at_idx').on(table.userId, table.createdAt),
    uniqueIndex('invoices_public_token_hash_idx').on(table.publicTokenHash),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
