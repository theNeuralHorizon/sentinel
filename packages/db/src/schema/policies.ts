import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Declarative policies that gate remediation dispatch and compliance reports.
// Example: "block scan if any critical CVE with EPSS > 0.3"
export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").default(true).notNull(),

    // JSON rules engine document. See packages/shared/src/policy.ts for the schema.
    rules: jsonb("rules").default(sql`'{"conditions":[],"action":"warn"}'::jsonb`).notNull(),

    tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("policies_slug_idx").on(t.slug),
    index("policies_enabled_idx").on(t.enabled),
  ],
);

export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;
