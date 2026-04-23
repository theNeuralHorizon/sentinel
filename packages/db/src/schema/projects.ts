import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    repoUrl: text("repo_url"),
    defaultBranch: text("default_branch").default("main").notNull(),
    tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("projects_slug_idx").on(t.slug),
    index("projects_tags_idx").using("gin", t.tags),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
