import { sql, type SQL } from 'drizzle-orm';
import { timestamp } from 'drizzle-orm/pg-core';

/**
 * The SQL list `'a', 'b', 'c'` for a CHECK (column in (...)) built from a TS enum,
 * so the database rejects values the enum does not have. Only for our own enum
 * values, never for user input: they are inlined, not bound.
 */
export function enumValues(values: Record<string, string>): SQL {
  return sql.raw(
    Object.values(values)
      .map((value) => `'${value}'`)
      .join(', '),
  );
}

export const timestamps = {
  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp('updated_at', {
    withTimezone: true,
  })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};
