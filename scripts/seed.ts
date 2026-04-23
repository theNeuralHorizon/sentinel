#!/usr/bin/env bun
// Seed the database with demo projects, policies, and a sample scan.
// Safe to run repeatedly — uses ON CONFLICT / idempotent inserts.
//
// Usage: bun run scripts/seed.ts

import { createDb, schema, sql } from "../packages/db/src";
import { componentEmbeddingText, createDefaultEmbedder } from "../packages/ai/src";
import { classifyLicense, computeBaselineRisk } from "../packages/shared/src";

const db = createDb(process.env.DATABASE_URL);

async function upsertProject(
  slug: string,
  name: string,
  description: string,
  repoUrl: string,
) {
  const existing = await db.execute(
    sql`SELECT id FROM projects WHERE slug = ${slug} LIMIT 1`,
  );
  if (Array.isArray(existing) && existing.length > 0) {
    return (existing[0] as { id: string }).id;
  }
  const [row] = await db
    .insert(schema.projects)
    .values({
      slug,
      name,
      description,
      repoUrl,
      defaultBranch: "main",
      tags: ["demo", "seed"],
    })
    .returning();
  return row!.id;
}

async function upsertPolicy(
  slug: string,
  name: string,
  rules: schema.Policy["rules"],
): Promise<void> {
  const existing = await db.execute(
    sql`SELECT id FROM policies WHERE slug = ${slug} LIMIT 1`,
  );
  if (Array.isArray(existing) && existing.length > 0) return;
  await db.insert(schema.policies).values({
    slug,
    name,
    description: `Seeded policy: ${name}`,
    rules,
    enabled: true,
    tags: ["seed"],
  });
}

async function main(): Promise<void> {
  console.log("seeding sentinel demo data…");

  const paymentsId = await upsertProject(
    "payments-api",
    "Payments API",
    "Stripe + ACH integration service. PCI-adjacent, highest compliance tier.",
    "https://github.com/theNeuralHorizon/sentinel-demo-payments",
  );
  const mlId = await upsertProject(
    "ml-recommender",
    "ML Recommender",
    "Personalisation service — uses HuggingFace models + an MCP weather server.",
    "https://github.com/theNeuralHorizon/sentinel-demo-ml",
  );
  const webId = await upsertProject(
    "marketing-site",
    "Marketing Site",
    "Public Next.js marketing site. Low-risk tier.",
    "https://github.com/theNeuralHorizon/sentinel-demo-marketing",
  );

  await upsertPolicy("block-agpl", "Block AGPL in proprietary code", {
    conditions: [{ field: "license", op: "in", value: ["AGPL-3.0", "SSPL-1.0"] }],
    action: "block",
  });
  await upsertPolicy("escalate-critical-epss", "Escalate critical + active exploitation", {
    conditions: [
      { field: "severity", op: "eq", value: "critical" },
      { field: "epss", op: "gte", value: 0.5 },
    ],
    action: "escalate",
  });
  await upsertPolicy("warn-unknown-license", "Warn on unknown licenses", {
    conditions: [{ field: "licenseRisk", op: "eq", value: "unknown" }],
    action: "warn",
  });

  // Demo scan with components.
  const embedder = createDefaultEmbedder();
  const demoComponents = [
    { ecosystem: "npm", name: "lodash", version: "4.17.11", license: "MIT", isTransitive: true },
    { ecosystem: "npm", name: "express", version: "4.19.0", license: "MIT", isTransitive: false },
    { ecosystem: "pypi", name: "pyyaml", version: "5.3.1", license: "MIT", isTransitive: false },
    { ecosystem: "pypi", name: "requests", version: "2.30.0", license: "Apache-2.0", isTransitive: false },
    { ecosystem: "gomodules", name: "x/net", version: "v0.6.0", license: "BSD-3-Clause", isTransitive: true },
    { ecosystem: "ml_model", name: "codellama/CodeLlama-7b", version: "1.0", license: "Llama-2-Community", isTransitive: false },
    { ecosystem: "mcp_server", name: "weather", version: "1.2.0", license: "MIT", isTransitive: false },
  ] as const;

  // Skip if scans already exist for this project.
  const prevScan = await db.execute(
    sql`SELECT id FROM scans WHERE project_id = ${paymentsId} LIMIT 1`,
  );
  if (Array.isArray(prevScan) && prevScan.length > 0) {
    console.log("demo scan already seeded — skipping");
    console.log("done.");
    await db.$client.end();
    return;
  }

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
  if (!scan) throw new Error("failed to insert seed scan");

  const texts = demoComponents.map((c) =>
    componentEmbeddingText({
      name: c.name,
      version: c.version,
      ecosystem: c.ecosystem,
      purl: `pkg:${c.ecosystem}/${c.name}@${c.version}`,
      license: c.license,
    }),
  );
  const vectors = await embedder.embed(texts);

  let critical = 0,
    high = 0,
    medium = 0,
    low = 0;
  const riskScores: number[] = [];

  for (const [i, c] of demoComponents.entries()) {
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

    // Seed a vulnerability for some components.
    const vulnTemplate = pickVulnTemplate(c.name, c.version);
    if (!vulnTemplate) continue;

    const baseline = computeBaselineRisk({
      severity: vulnTemplate.severity,
      cvssScore: vulnTemplate.cvssScore,
      epssScore: vulnTemplate.epssScore,
      licenseRisk: classifyLicense(c.license),
      isTransitive: c.isTransitive,
      fixAvailable: vulnTemplate.fixedVersions.length > 0,
    });
    riskScores.push(baseline);
    const sev: string = vulnTemplate.severity;
    if (sev === "critical") critical++;
    else if (sev === "high") high++;
    else if (sev === "medium") medium++;
    else if (sev === "low") low++;

    await db.insert(schema.vulnerabilities).values({
      componentId: row.id,
      scanId: scan.id,
      advisoryId: vulnTemplate.advisoryId,
      aliases: vulnTemplate.aliases,
      summary: vulnTemplate.summary,
      severity: vulnTemplate.severity,
      cvssScore: vulnTemplate.cvssScore,
      cvssVector: vulnTemplate.cvssVector,
      epssScore: vulnTemplate.epssScore,
      aiRiskScore: baseline,
      fixedVersions: vulnTemplate.fixedVersions,
      references: vulnTemplate.references,
    });
  }

  const risk = aggregate(riskScores);
  await db
    .update(schema.scans)
    .set({
      status: "completed",
      componentCount: demoComponents.length,
      vulnCount: critical + high + medium + low,
      criticalCount: critical,
      highCount: high,
      mediumCount: medium,
      lowCount: low,
      riskScore: risk,
      completedAt: new Date(),
    })
    .where(sql`id = ${scan.id}`);

  // Also seed a scan for the ML project so ecosystem coverage is visible.
  await db.insert(schema.scans).values({
    projectId: mlId,
    kind: "ml_bom",
    triggeredBy: "seed",
    status: "completed",
    componentCount: 4,
    vulnCount: 1,
    mediumCount: 1,
    riskScore: 42,
    startedAt: new Date(),
    completedAt: new Date(),
  });
  await db.insert(schema.scans).values({
    projectId: webId,
    kind: "full",
    triggeredBy: "seed",
    status: "completed",
    componentCount: 120,
    vulnCount: 0,
    riskScore: 8,
    startedAt: new Date(),
    completedAt: new Date(),
  });

  console.log("seeded 3 projects, 3 policies, 3 scans, %d vulns", critical + high + medium + low);
  await db.$client.end();
}

function pickVulnTemplate(name: string, version: string) {
  if (name === "lodash" && version.startsWith("4.17.1")) {
    return {
      advisoryId: "GHSA-jf85-cpcp-j695",
      aliases: ["CVE-2019-10744"],
      summary: "Prototype pollution in lodash via defaultsDeep",
      severity: "high" as const,
      cvssScore: 7.4,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N",
      epssScore: 0.41,
      fixedVersions: ["4.17.21"],
      references: [{ type: "advisory", url: "https://github.com/advisories/GHSA-jf85-cpcp-j695" }],
    };
  }
  if (name === "pyyaml" && version.startsWith("5.3")) {
    return {
      advisoryId: "GHSA-8q59-q68h-6hv4",
      aliases: ["CVE-2020-14343"],
      summary: "pyyaml full_load allows arbitrary code execution",
      severity: "critical" as const,
      cvssScore: 9.8,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
      epssScore: 0.67,
      fixedVersions: ["6.0"],
      references: [{ type: "advisory", url: "https://nvd.nist.gov/vuln/detail/CVE-2020-14343" }],
    };
  }
  if (name === "requests" && version.startsWith("2.30")) {
    return {
      advisoryId: "GHSA-j8r2-6x86-q33q",
      aliases: ["CVE-2023-32681"],
      summary: "requests leaks Proxy-Authorization on redirect cross-origin",
      severity: "medium" as const,
      cvssScore: 6.1,
      cvssVector: "CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:C/C:H/I:H/A:N",
      epssScore: 0.18,
      fixedVersions: ["2.31.0"],
      references: [{ type: "advisory", url: "https://github.com/advisories/GHSA-j8r2-6x86-q33q" }],
    };
  }
  if (name === "x/net" && version.startsWith("v0.6")) {
    return {
      advisoryId: "GHSA-vvpx-j8f3-3w6h",
      aliases: ["CVE-2022-41723"],
      summary: "Uncontrolled resource consumption in golang.org/x/net/http2",
      severity: "high" as const,
      cvssScore: 7.5,
      cvssVector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H",
      epssScore: 0.12,
      fixedVersions: ["v0.7.0"],
      references: [{ type: "advisory", url: "https://nvd.nist.gov/vuln/detail/CVE-2022-41723" }],
    };
  }
  return null;
}

function aggregate(scores: number[]): number {
  if (scores.length === 0) return 0;
  const peak = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(peak * 0.7 + avg * 0.3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
