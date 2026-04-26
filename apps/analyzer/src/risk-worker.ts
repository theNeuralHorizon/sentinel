import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";
import { analyzeRisk, proposeRemediation, pickDriver, type LlmDriver } from "@sentinel/ai";
import { logger } from "./logger";

// The risk worker polls for vulnerabilities that haven't been AI-enriched yet
// and fills in ai_risk_score / exploitability / business_impact / reasoning.
// It also proposes a remediation plan via a second LLM call.

export interface WorkerConfig {
  db: Database;
  concurrency: number;
  batchSize: number;
  intervalMs: number;
  /** Honoured for backwards compatibility, but the driver itself is
   *  picked from env (LLM_PROVIDER + matching key). When false, we pass
   *  `null` and the worker uses the deterministic baseline. */
  runLLM: boolean;
}

export function startRiskWorker(cfg: WorkerConfig): () => void {
  let cancelled = false;

  // Resolve the driver in the background. pickDriver() now returns a
  // Promise (it dynamic-imports the active SDK on first call), so the
  // worker fires up the loop immediately and switches to LLM mode once
  // the SDK has loaded. A misconfigured key surfaces as a warning;
  // the worker stays on the deterministic path.
  let driver: LlmDriver | null = null;
  if (cfg.runLLM) {
    pickDriver()
      .then((d) => {
        driver = d.provider === "none" ? null : d;
        if (driver) logger.info({ provider: driver.provider }, "LLM driver online");
      })
      .catch((err) => {
        logger.warn({ err }, "LLM driver init failed; deterministic fallback only");
      });
  }

  async function tick(): Promise<void> {
    if (cancelled) return;
    try {
      const rows = await cfg.db
        .select({
          vulnerability: schema.vulnerabilities,
          component: schema.components,
        })
        .from(schema.vulnerabilities)
        .innerJoin(
          schema.components,
          eq(schema.components.id, schema.vulnerabilities.componentId),
        )
        .where(
          and(
            isNull(schema.vulnerabilities.aiReasoning),
            eq(schema.vulnerabilities.state, "open"),
          ),
        )
        .limit(cfg.batchSize);

      if (rows.length === 0) {
        return;
      }
      logger.info({ count: rows.length }, "analysing batch");

      await Promise.all(
        rows.map(async ({ vulnerability, component }) => {
          await analyseOne({ cfg, driver, vulnerability, component });
        }),
      );

      // Recompute scan-level risk_score ONCE per scan touched in this
      // batch — not once per vulnerability. Yesterday's behaviour fired
      // a full PERCENTILE_CONT subquery 40+ times per tick.
      const touchedScans = [...new Set(rows.map((r) => r.vulnerability.scanId))];
      if (touchedScans.length > 0) {
        await cfg.db.execute(sql`
          UPDATE scans s SET risk_score = COALESCE((
            SELECT ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ai_risk_score))::int
            FROM vulnerabilities WHERE scan_id = s.id
          ), 0)
          WHERE s.id = ANY(${touchedScans}::uuid[])
        `);
      }
    } catch (err) {
      logger.error({ err }, "risk worker tick failed");
    }
  }

  const loop = (async () => {
    while (!cancelled) {
      await tick();
      await new Promise((r) => setTimeout(r, cfg.intervalMs));
    }
  })();

  logger.info({ intervalMs: cfg.intervalMs, runLLM: cfg.runLLM }, "risk worker started");
  return () => {
    cancelled = true;
    void loop;
  };
}

async function analyseOne({
  cfg,
  driver,
  vulnerability,
  component,
}: {
  cfg: WorkerConfig;
  driver: LlmDriver | null;
  vulnerability: typeof schema.vulnerabilities.$inferSelect;
  component: typeof schema.components.$inferSelect;
}): Promise<void> {
  const db = cfg.db;

  let ai_risk_score = vulnerability.aiRiskScore ?? 0;
  let exploitability = "theoretical";
  let business_impact = "moderate";
  let reasoning: string;

  if (driver) {
    try {
      const analysis = await analyzeRisk(
        {
          advisoryId: vulnerability.advisoryId,
          summary: vulnerability.summary,
          details: vulnerability.details,
          severity: vulnerability.severity,
          cvssScore: vulnerability.cvssScore,
          cvssVector: vulnerability.cvssVector,
          epssScore: vulnerability.epssScore,
          componentName: component.name,
          componentVersion: component.version,
          componentEcosystem: component.ecosystem,
          componentPurl: component.purl,
          isTransitive: component.isTransitive,
          fixedVersions: vulnerability.fixedVersions,
        },
        { driver },
      );
      ai_risk_score = analysis.ai_risk_score;
      exploitability = analysis.exploitability;
      business_impact = analysis.business_impact;
      reasoning = analysis.reasoning;
    } catch (err) {
      logger.warn({ err, advisory: vulnerability.advisoryId }, "LLM call failed, falling back");
      reasoning = fallbackReasoning(vulnerability, component);
    }
  } else {
    reasoning = fallbackReasoning(vulnerability, component);
  }

  await db
    .update(schema.vulnerabilities)
    .set({
      aiRiskScore: ai_risk_score,
      exploitability,
      businessImpact: business_impact,
      aiReasoning: reasoning,
    })
    .where(eq(schema.vulnerabilities.id, vulnerability.id));

  // Scan-level risk_score is recomputed once per batch in tick(),
  // not per vulnerability. With concurrency=4 and batchSize=10, that
  // dropped from up to 40 redundant PERCENTILE_CONT subqueries down
  // to one parameterised UPDATE.

  // Propose remediation if fix is available OR severity >= high.
  const shouldPropose =
    vulnerability.fixedVersions.length > 0 ||
    vulnerability.severity === "critical" ||
    vulnerability.severity === "high";
  if (!shouldPropose) return;

  try {
    let plan;
    if (driver) {
      plan = await proposeRemediation(
        {
          advisoryId: vulnerability.advisoryId,
          severity: vulnerability.severity,
          aiRiskScore: ai_risk_score,
          exploitability,
          componentName: component.name,
          componentVersion: component.version,
          componentEcosystem: component.ecosystem,
          fixedVersions: vulnerability.fixedVersions,
          licenseRisk: component.licenseRisk,
          hasSlack: true,
          hasPagerDuty: true,
          hasIssueTracker: true,
        },
        { driver },
      );
    } else {
      plan = {
        kind: vulnerability.fixedVersions.length > 0 ? "pr_bump" : "issue_ticket",
        requires_approval: true,
        parameters:
          vulnerability.fixedVersions.length > 0
            ? { target_version: vulnerability.fixedVersions[0] }
            : { severity: vulnerability.severity },
        reasoning: "Deterministic fallback remediation planner.",
      } as const;
    }
    if (plan.kind === "none") return;

    await db.insert(schema.remediations).values({
      vulnerabilityId: vulnerability.id,
      kind: plan.kind,
      state: "proposed",
      workflowId: `sentinel-${plan.kind}`,
      playbook: plan.kind,
      parameters: plan.parameters,
      proposalReasoning: plan.reasoning,
    });
  } catch (err) {
    logger.warn({ err, vuln: vulnerability.id }, "failed to propose remediation");
  }
}

function fallbackReasoning(
  v: typeof schema.vulnerabilities.$inferSelect,
  c: typeof schema.components.$inferSelect,
): string {
  const fix = v.fixedVersions.length > 0 ? `Patch available in ${v.fixedVersions.join(", ")}.` : "No patch available.";
  return `Baseline assessment (no LLM available). Severity ${v.severity} affecting ${c.name}@${c.version} (${c.ecosystem}). ${fix}`;
}
