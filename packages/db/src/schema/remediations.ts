import { pgTable, uuid, text, timestamp, jsonb, pgEnum, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vulnerabilities } from "./vulnerabilities";

export const remediationKindEnum = pgEnum("remediation_kind", [
  "pr_bump",
  "pr_swap",
  "issue_ticket",
  "notify_slack",
  "rotate_secret",
  "escalate_oncall",
  "custom_n8n",
]);

export const remediationStateEnum = pgEnum("remediation_state", [
  "proposed",
  "queued",
  "dispatched",
  "succeeded",
  "failed",
  "rolled_back",
]);

export const remediations = pgTable(
  "remediations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vulnerabilityId: uuid("vulnerability_id")
      .notNull()
      .references(() => vulnerabilities.id, { onDelete: "cascade" }),

    kind: remediationKindEnum("kind").notNull(),
    state: remediationStateEnum("state").default("proposed").notNull(),

    workflowId: text("workflow_id"),
    executionId: text("execution_id"),
    playbook: text("playbook"),
    parameters: jsonb("parameters").default(sql`'{}'::jsonb`).notNull(),

    proposalReasoning: text("proposal_reasoning"),
    outcome: jsonb("outcome").default(sql`'{}'::jsonb`).notNull(),
    errorMessage: text("error_message"),

    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("remediations_vuln_idx").on(t.vulnerabilityId),
    index("remediations_state_idx").on(t.state),
  ],
);

export type Remediation = typeof remediations.$inferSelect;
export type NewRemediation = typeof remediations.$inferInsert;
