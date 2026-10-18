import { sql } from 'drizzle-orm';
import { pgTable, text, uuid, varchar, uniqueIndex } from 'drizzle-orm/pg-core';

import { timestamps } from './helper.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    name: varchar('name', { length: 255 }),

    email: varchar('email', { length: 255 }).notNull(),

    passwordHash: text('password_hash').notNull(),

    ...timestamps,
  },
  (table) => [
    // Unique regardless of case, so Ali@x.com and ali@x.com cannot both register.
    uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
  ],
);
