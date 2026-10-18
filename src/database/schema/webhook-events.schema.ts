import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';

import { enumValues, timestamps } from './helper.js';
import { WebhookEventStatus } from './webhook-events-status.js';

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    stripeEventId: varchar('stripe_event_id', {
      length: 255,
    })
      .notNull()
      .unique(),

    eventType: varchar('event_type', {
      length: 255,
    }).notNull(),

    status: varchar('status', { length: 30 })
      .$type<WebhookEventStatus>()
      .notNull()
      .default(WebhookEventStatus.Received),

    payload: jsonb('payload').$type<Record<string, unknown>>(),

    lastError: text('last_error'),

    processedAt: timestamp('processed_at', {
      withTimezone: true,
    }),

    ...timestamps,
  },
  (table) => [
    check(
      'webhook_events_status_valid',
      sql`${table.status} in (${enumValues(WebhookEventStatus)})`,
    ),
  ],
);
