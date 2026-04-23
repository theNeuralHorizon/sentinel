import { pgTable, uuid, text, timestamp, jsonb, integer, index, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";

export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const scanKindEnum = pgEnum("scan_kind", [
  "full",
  "incremental",
  "drift",
  "ml_bom",
]);

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    gitRef: text("git_ref"),
    commitSha: text("commit_sha"),
    status: scanStatusEnum("status").default("pending").notNull(),
    kind: scanKindEnum("kind").default("full").notNull(),
    triggeredBy: text("triggered_by").default("manual").notNull(),

    componentCount: integer("component_count").default(0).notNull(),
    vulnCount: integer("vuln_count").default(0).notNull(),
    criticalCount: integer("critical_count").default(0).notNull(),
    highCount: integer("high_count").default(0).notNull(),
    mediumCount: integer("medium_count").default(0).notNull(),
    lowCount: integer("low_count").default(0).notNull(),

    riskScore: integer("risk_score").default(0).notNull(),
    sbomS3Key: text("sbom_s3_key"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("scans_project_idx").on(t.projectId),
    index("scans_status_idx").on(t.status),
    index("scans_created_at_idx").on(t.createdAt.desc()),
  ],
);

export type Scan = typeof scans.$inferSelect;
export type NewScan = typeof scans.$inferInsert;
