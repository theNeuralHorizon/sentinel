import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Database } from "@sentinel/db";

type Vars = { db: Database };

const metricsRoute = new Hono<{ Variables: Vars }>();

// Dashboard summary: one round-trip for the home page.
metricsRoute.get("/summary", async (c) => {
  const db = c.get("db");

  const [overall] = await db.execute<{
    projects: string;
    total_scans: string;
    total_components: string;
    total_vulns: string;
    critical: string;
    high: string;
    medium: string;
    low: string;
    avg_risk: string | null;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM scans) AS total_scans,
      (SELECT COUNT(*) FROM components) AS total_components,
      (SELECT COUNT(*) FROM vulnerabilities) AS total_vulns,
      (SELECT COUNT(*) FROM vulnerabilities WHERE severity = 'critical') AS critical,
      (SELECT COUNT(*) FROM vulnerabilities WHERE severity = 'high') AS high,
      (SELECT COUNT(*) FROM vulnerabilities WHERE severity = 'medium') AS medium,
      (SELECT COUNT(*) FROM vulnerabilities WHERE severity = 'low') AS low,
      (SELECT AVG(risk_score) FROM scans WHERE status = 'completed') AS avg_risk
  `);

  const topRisks = await db.execute(sql`
    SELECT v.advisory_id AS "advisoryId",
           v.summary,
           v.severity,
           v.cvss_score AS "cvssScore",
           v.ai_risk_score AS "aiRiskScore",
           c.name AS "componentName",
           c.version AS "componentVersion",
           c.ecosystem,
           p.slug AS "projectSlug"
    FROM vulnerabilities v
    JOIN components c ON c.id = v.component_id
    JOIN projects p ON p.id = c.project_id
    WHERE v.state = 'open'
    ORDER BY v.ai_risk_score DESC NULLS LAST, v.cvss_score DESC NULLS LAST
    LIMIT 10
  `);

  const byEcosystem = await db.execute(sql`
    SELECT c.ecosystem, COUNT(DISTINCT c.id)::int AS components, COUNT(v.id)::int AS vulnerabilities
    FROM components c
    LEFT JOIN vulnerabilities v ON v.component_id = c.id
    GROUP BY c.ecosystem
    ORDER BY components DESC
  `);

  return c.json({
    overall: overall ?? {},
    topRisks,
    byEcosystem,
  });
});

export { metricsRoute };
