import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema.js';
import { timestamps } from './helper.js';
import { ImportStatus } from './import-status.js';

export const invoiceImports = pgTable(
  'invoice_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    fileName: varchar('file_name', { length: 255 }).notNull(),

    status: varchar('status', { length: 30 })
      .$type<ImportStatus>()
      .notNull()
      .default(ImportStatus.Pending),

    importedCount: integer('imported_count').notNull().default(0),

    errors: jsonb('errors').$type<string[]>(),

    finishedAt: timestamp('finished_at', { withTimezone: true }),

    ...timestamps,
  },
  (table) => [index('invoice_imports_user_id_idx').on(table.userId)],
);

export type InvoiceImport = typeof invoiceImports.$inferSelect;
