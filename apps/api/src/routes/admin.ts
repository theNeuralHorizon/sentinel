// Tiny admin surface — at the moment, only `POST /admin/seed`. Gated by a
// shared secret env var (`ADMIN_TOKEN`) so the endpoint is safe to expose
// even on a public Render URL. Token is sent via `X-Admin-Token` header.
//
// We deliberately avoid making the seed reachable through the regular JWT
// auth: the seed wipes & re-creates demo data and we don't want analysts
// or viewers to be able to fire it.

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";
import { classifyLicense, computeBaselineRisk } from "@sentinel/shared";
import { componentEmbeddingText, createDefaultEmbedder } from "@sentinel/ai";

type Vars = { db: Database };

export function createAdminRoute(): Hono<{ Variables: Vars }> {
  const route = new Hono<{ Variables: Vars }>();

  // Always require an admin token; refuse if it's unset (locked-down by default).
  route.use("*", async (c, next) => {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected || expected.length < 16) {
      return c.json({ error: "admin_disabled", detail: "ADMIN_TOKEN not configured" }, 403);
    }
    if (c.req.header("x-admin-token") !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });

  // POST /v1/admin/seed → idempotent demo seed.
  route.post("/seed", async (c) => {
    const db = c.get("db");

    const rows = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM projects`,
    );
    const existing = Number(rows[0]?.count ?? 0);
    if (existing > 0) {
      return c.json({ status: "already_seeded", projects: existing });
    }

    const embedder = createDefaultEmbedder();

    const projects = await db
      .insert(schema.projects)
      .values([
        {
          slug: "payments-api",
          name: "Payments API",
          description: "Stripe + ACH integration. PCI-adjacent, highest tier.",
          repoUrl: "https://github.com/theNeuralHorizon/sentinel-demo-payments",
          tags: ["demo", "seed"],
        },
        {
          slug: "ml-recommender",
          name: "ML Recommender",
          description: "Personalisation. HuggingFace models + an MCP weather server.",
          repoUrl: "https://github.com/theNeuralHorizon/sentinel-demo-ml",
          tags: ["demo", "seed"],
        },
        {
          slug: "marketing-site",
          name: "Marketing Site",
          description: "Public Next.js marketing site. Low-risk tier.",
          repoUrl: "https://github.com/theNeuralHorizon/sentinel-demo-marketing",
          tags: ["demo", "seed"],
        },
      ])
      .returning();
    const paymentsId = projects[0]!.id;

    await db.insert(schema.policies).values([
      {
        slug: "block-agpl",
        name: "Block AGPL in proprietary code",
        description: "Reject AGPL/SSPL packages; legal-team baseline.",
        rules: { conditions: [{ field: "license", op: "in", value: ["AGPL-3.0", "SSPL-1.0"] }], action: "block" },
        tags: ["seed"],
      },
      {
        slug: "escalate-critical-epss",
        name: "Escalate critical + active exploitation",
        description: "Page on-call when CVSS critical meets EPSS ≥ 0.5.",
        rules: {
          conditions: [
            { field: "severity", op: "eq", value: "critical" },
            { field: "epss", op: "gte", value: 0.5 },
          ],
          action: "escalate",
        },
        tags: ["seed"],
      },
      {
        slug: "warn-unknown-license",
        name: "Warn on unknown licenses",
        description: "Flag undeclared licenses for triage.",
        rules: { conditions: [{ field: "licenseRisk", op: "eq", value: "unknown" }], action: "warn" },
        tags: ["seed"],
      },
    ]);

    const [scan] = await db
      .insert(schema.scans)
      .values({
        projectId: paymentsId,
        gitRef: "main",
        commitSha: "seed0000000000000000000000000000000000000",
        kind: "full",
        triggeredBy: "seed",
        status: "running",
        startedAt: new Date(),
      })
      .returning();
    if (!scan) throw new Error("failed to create scan");

    const demo = [
      { ecosystem: "npm" as const, name: "lodash", version: "4.17.11", license: "MIT", isTransitive: true },
      { ecosystem: "npm" as const, name: "express", version: "4.19.0", license: "MIT", isTransitive: false },
      { ecosystem: "pypi" as const, name: "pyyaml", version: "5.3.1", license: "MIT", isTransitive: false },
      { ecosystem: "pypi" as const, name: "requests", version: "2.30.0", license: "Apache-2.0", isTransitive: false },
      { ecosystem: "gomodules" as const, name: "x/net", version: "v0.6.0", license: "BSD-3-Clause", isTransitive: true },
      { ecosystem: "ml_model" as const, name: "codellama/CodeLlama-7b", version: "1.0", license: "Llama-2-Community", isTransitive: false },
      { ecosystem: "mcp_server" as const, name: "weather", version: "1.2.0", license: "MIT", isTransitive: false },
    ];

    const vectors = await embedder.embed(
      demo.map((c) =>
        componentEmbeddingText({
          name: c.name,
          version: c.version,
          ecosystem: c.ecosystem,
          purl: `pkg:${c.ecosystem}/${c.name}@${c.version}`,
          license: c.license,
        }),
      ),
    );

    let critical = 0,
      high = 0,
      medium = 0,
      low = 0;
    const riskScores: number[] = [];

    for (const [i, c] of demo.entries()) {
      const purl = `pkg:${c.ecosystem}/${c.name}@${c.version}`;
      const [row] = await db
        .insert(schema.components)
        .values({
          scanId: scan.id,
          projectId: paymentsId,
          ecosystem: c.ecosystem,
          name: c.name,
          version: c.version,
          purl,
          license: c.license,
          licenseRisk: classifyLicense(c.license),
          isTransitive: c.isTransitive,
          embedding: vectors[i] ?? null,
        })
        .returning();
      if (!row) continue;

      const t = pickVuln(c.name, c.version);
      if (!t) continue;

      const baseline = computeBaselineRisk({
        severity: t.severity,
        cvssScore: t.cvssScore,
        epssScore: t.epssScore,
        licenseRisk: classifyLicense(c.license),
        isTransitive: c.isTransitive,
        fixAvailable: true,
      });
      riskScores.push(baseline);
      const sev: string = t.severity;
      if (sev === "critical") critical++;
      else if (sev === "high") high++;
      else if (sev === "medium") medium++;
      else if (sev === "low") low++;

      await db.insert(schema.vulnerabilities).values({
        componentId: row.id,
        scanId: scan.id,
        advisoryId: t.advisoryId,
        aliases: t.aliases ?? [],
        summary: t.summary,
        severity: t.severity,
        cvssScore: t.cvssScore,
        cvssVector: t.cvssVector ?? null,
        epssScore: t.epssScore,
        aiRiskScore: baseline,
        fixedVersions: t.fixed,
        references: t.references,
      });
    }

    const peak = riskScores.length ? Math.max(...riskScores) : 0;
    const avg = riskScores.length ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 0;
    const risk = Math.round(peak * 0.7 + avg * 0.3);

    await db
      .update(schema.scans)
      .set({
        status: "completed",
        componentCount: demo.length,
        vulnCount: critical + high + medium + low,
        criticalCount: critical,
        highCount: high,
        mediumCount: medium,
        lowCount: low,
        riskScore: risk,
        completedAt: new Date(),
      })
      .where(sql`id = ${scan.id}`);

    return c.json({ status: "seeded", projects: 3, scans: 1, components: demo.length, vulns: critical + high + medium + low });
  });

  return route;
}

function pickVuln(name: string, version: string): {
  advisoryId: string;
  aliases?: string[];
  summary: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  cvssScore: number;
  cvssVector?: string;
  epssScore: number;
  fixed: string[];
  references: Array<{ type: string; url: string }>;
} | null {
  if (name === "lodash" && version.startsWith("4.17.1"))
    return {
      advisoryId: "GHSA-jf85-cpcp-j695",
      aliases: ["CVE-2019-10744"],
      summary: "Prototype pollution in lodash via defaultsDeep",
      severity: "high",
      cvssScore: 7.4,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N",
      epssScore: 0.41,
      fixed: ["4.17.21"],
      references: [{ type: "advisory", url: "https://github.com/advisories/GHSA-jf85-cpcp-j695" }],
    };
  if (name === "pyyaml" && version.startsWith("5.3"))
    return {
      advisoryId: "GHSA-8q59-q68h-6hv4",
      aliases: ["CVE-2020-14343"],
      summary: "pyyaml full_load allows arbitrary code execution",
      severity: "critical",
      cvssScore: 9.8,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      epssScore: 0.67,
      fixed: ["6.0"],
      references: [{ type: "advisory", url: "https://nvd.nist.gov/vuln/detail/CVE-2020-14343" }],
    };
  if (name === "requests" && version.startsWith("2.30"))
    return {
      advisoryId: "GHSA-j8r2-6x86-q33q",
      aliases: ["CVE-2023-32681"],
      summary: "requests leaks Proxy-Authorization on redirect cross-origin",
      severity: "medium",
      cvssScore: 6.1,
      cvssVector: "CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:C/C:H/I:H/A:N",
      epssScore: 0.18,
      fixed: ["2.31.0"],
      references: [{ type: "advisory", url: "https://github.com/advisories/GHSA-j8r2-6x86-q33q" }],
    };
  if (name === "x/net" && version.startsWith("v0.6"))
    return {
      advisoryId: "GHSA-vvpx-j8f3-3w6h",
      aliases: ["CVE-2022-41723"],
      summary: "Uncontrolled resource consumption in golang.org/x/net/http2",
      severity: "high",
      cvssScore: 7.5,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H",
      epssScore: 0.12,
      fixed: ["v0.7.0"],
      references: [{ type: "advisory", url: "https://nvd.nist.gov/vuln/detail/CVE-2022-41723" }],
    };
  return null;
}
