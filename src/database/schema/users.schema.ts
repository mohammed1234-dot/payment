import { pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';

import { timestamps } from './helper.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  name: varchar('name', { length: 255 }),

  email: varchar('email', { length: 255 }).notNull().unique(),

  passwordHash: text('password_hash').notNull(),

  ...timestamps,
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
