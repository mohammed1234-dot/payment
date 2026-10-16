import {pgTable, text, timestamp, uuid, varchar} from "drizzle-orm/pg-core";
import {timestamps} from "./helper.js";
export const webhookEvents = pgTable("webhook_events", {
    id: uuid("id").primaryKey(),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    payload: text("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    stripeEventId: varchar("stripe_event_id", { length: 255 }).notNull(),
    ...timestamps
})    