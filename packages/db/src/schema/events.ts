import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Append-only audit log. Powers the real-time activity feed and post-mortems.
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id"),
    scanId: uuid("scan_id"),
    kind: text("kind").notNull(),
    actor: text("actor").notNull(),
    subject: text("subject"),
    payload: jsonb("payload").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("events_project_idx").on(t.projectId),
    index("events_scan_idx").on(t.scanId),
    index("events_kind_idx").on(t.kind),
    index("events_created_idx").on(t.createdAt.desc()),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
