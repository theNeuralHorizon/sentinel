import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  real,
  integer,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { components } from "./components";
import { scans } from "./scans";

export const severityEnum = pgEnum("severity", [
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const vulnStateEnum = pgEnum("vuln_state", [
  "open",
  "triaging",
  "suppressed",
  "fixed",
  "accepted_risk",
]);

export const vulnerabilities = pgTable(
  "vulnerabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),

    advisoryId: text("advisory_id").notNull(),
    aliases: text("aliases").array().default(sql`'{}'::text[]`).notNull(),
    summary: text("summary").notNull(),
    details: text("details"),

    severity: severityEnum("severity").notNull(),
    cvssScore: real("cvss_score"),
    cvssVector: text("cvss_vector"),
    epssScore: real("epss_score"),
    epssPercentile: real("epss_percentile"),

    // AI-enriched fields — see analyzer/src/risk.ts
    aiRiskScore: integer("ai_risk_score"),
    aiReasoning: text("ai_reasoning"),
    exploitability: text("exploitability"),
    businessImpact: text("business_impact"),

    fixedVersions: text("fixed_versions").array().default(sql`'{}'::text[]`).notNull(),
    affectedRanges: jsonb("affected_ranges").default(sql`'[]'::jsonb`).notNull(),
    references: jsonb("references").default(sql`'[]'::jsonb`).notNull(),

    state: vulnStateEnum("state").default("open").notNull(),
    suppressedReason: text("suppressed_reason"),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    modifiedAt: timestamp("modified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("vulns_component_idx").on(t.componentId),
    index("vulns_scan_idx").on(t.scanId),
    index("vulns_advisory_idx").on(t.advisoryId),
    index("vulns_severity_idx").on(t.severity),
    index("vulns_state_idx").on(t.state),
    index("vulns_risk_idx").on(t.aiRiskScore),
  ],
);

export type Vulnerability = typeof vulnerabilities.$inferSelect;
export type NewVulnerability = typeof vulnerabilities.$inferInsert;
