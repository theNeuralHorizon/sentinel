import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";
import { EventSubjects } from "@sentinel/shared";
import { computeBaselineRisk, aggregateProjectRisk } from "@sentinel/shared";
import { classifyLicense } from "@sentinel/shared";
import { componentEmbeddingText, createDefaultEmbedder } from "@sentinel/ai";
import type { Severity } from "@sentinel/shared";
import type { ScannerClient } from "../services/scanner";
import { publishEvent } from "../services/events";
import type { WsHub } from "../services/ws-hub";
import { logger } from "../logger";

type Vars = {
  db: Database;
  scanner: ScannerClient;
  natsUrl: string;
  wsHub: WsHub;
};

const scansRoute = new Hono<{ Variables: Vars }>();

const TriggerScanSchema = z.object({
  projectSlug: z.string().min(1),
  workDir: z.string().min(1),
  gitRef: z.string().optional(),
  commitSha: z.string().optional(),
  kind: z.enum(["full", "incremental", "drift", "ml_bom"]).default("full"),
  ecosystems: z.array(z.string()).optional(),
  triggeredBy: z.string().default("api"),
});

scansRoute.post("/", zValidator("json", TriggerScanSchema), async (c) => {
  const db = c.get("db");
  const scanner = c.get("scanner");
  const natsUrl = c.get("natsUrl");
  const wsHub = c.get("wsHub");
  const input = c.req.valid("json");

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.slug, input.projectSlug))
    .limit(1);
  if (!project) return c.json({ error: "project_not_found" }, 404);

  const [scan] = await db
    .insert(schema.scans)
    .values({
      projectId: project.id,
      gitRef: input.gitRef ?? null,
      commitSha: input.commitSha ?? null,
      kind: input.kind,
      triggeredBy: input.triggeredBy,
      status: "running",
      startedAt: new Date(),
      // Persist the requested workDir so the executor can read it back.
      metadata: { workDir: input.workDir },
    })
    .returning();
  if (!scan) throw new Error("failed to create scan row");

  await publishEvent(natsUrl, EventSubjects.ScanRequested, {
    scanId: scan.id,
    projectId: project.id,
    kind: input.kind,
    gitRef: input.gitRef,
    commitSha: input.commitSha,
    triggeredBy: input.triggeredBy,
    requestedAt: new Date().toISOString(),
  });
  wsHub.publish(`project:${project.id}`, { kind: "scan:started", scanId: scan.id });

  // Execute the scan synchronously for now. In production the API returns 202
  // and a worker consumes the ScanRequested event.
  executeScan({ db, scanner, wsHub, natsUrl, scan, projectId: project.id }).catch((err) => {
    logger.error({ err, scanId: scan.id }, "scan execution failed");
  });

  return c.json({ scan }, 202);
});

async function executeScan(args: {
  db: Database;
  scanner: ScannerClient;
  wsHub: WsHub;
  natsUrl: string;
  scan: typeof schema.scans.$inferSelect;
  projectId: string;
}): Promise<void> {
  const { db, scanner, wsHub, natsUrl, scan, projectId } = args;
  const embedder = createDefaultEmbedder();

  try {
    const result = await scanner.scan({
      scanId: scan.id,
      projectId,
      workDir: scan.metadata && typeof scan.metadata === "object" && "workDir" in scan.metadata
        ? String((scan.metadata as Record<string, unknown>).workDir ?? "/workspace")
        : "/workspace",
      kind: scan.kind,
      triggeredBy: scan.triggeredBy,
    });

    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    const riskScores: number[] = [];

    // Generate embeddings up-front so inserts can carry them.
    const texts = result.components.map((c) =>
      componentEmbeddingText({
        name: c.name,
        version: c.version,
        ecosystem: c.ecosystem,
        purl: c.purl,
        license: c.license ?? null,
        supplier: c.supplier ?? null,
      }),
    );
    const vectors = await embedder.embed(texts);

    // Insert components.
    const componentRows = await Promise.all(
      result.components.map(async (c, idx) => {
        const licenseRisk = classifyLicense(c.license);
        const [row] = await db
          .insert(schema.components)
          .values({
            scanId: scan.id,
            projectId,
            ecosystem: c.ecosystem,
            name: c.name,
            version: c.version,
            purl: c.purl,
            cpe: c.cpe ?? null,
            supplier: c.supplier ?? null,
            sourceUrl: c.sourceUrl ?? null,
            license: c.license ?? null,
            licenseConfidence: c.licenseConfidence ?? null,
            licenseRisk,
            isTransitive: c.isTransitive,
            directDependents: c.directDependents,
            hashSha256: c.hashSha256 ?? null,
            embedding: vectors[idx] ?? null,
          })
          .returning();
        return row;
      }),
    );
    const componentByPurl = new Map(componentRows.filter(Boolean).map((r) => [r!.purl, r!]));

    // Insert vulnerabilities with baseline risk.
    for (const { componentPurl, vuln } of result.vulnerabilities) {
      const comp = componentByPurl.get(componentPurl);
      if (!comp) continue;
      const severity = vuln.severity as Severity;
      const baselineRisk = computeBaselineRisk({
        severity,
        cvssScore: vuln.cvssScore ?? null,
        epssScore: vuln.epssScore ?? null,
        licenseRisk: classifyLicense(comp.license),
        isTransitive: comp.isTransitive,
        fixAvailable: vuln.fixedVersions.length > 0,
      });
      riskScores.push(baselineRisk);
      switch (severity) {
        case "critical":
          criticalCount += 1;
          break;
        case "high":
          highCount += 1;
          break;
        case "medium":
          mediumCount += 1;
          break;
        case "low":
          lowCount += 1;
          break;
      }
      await db.insert(schema.vulnerabilities).values({
        componentId: comp.id,
        scanId: scan.id,
        advisoryId: vuln.advisoryId,
        aliases: vuln.aliases,
        summary: vuln.summary,
        details: vuln.details ?? null,
        severity,
        cvssScore: vuln.cvssScore ?? null,
        cvssVector: vuln.cvssVector ?? null,
        epssScore: vuln.epssScore ?? null,
        aiRiskScore: baselineRisk,
        fixedVersions: vuln.fixedVersions,
        affectedRanges: vuln.affectedRanges,
        references: vuln.references,
        publishedAt: vuln.publishedAt ? new Date(vuln.publishedAt) : null,
        modifiedAt: vuln.modifiedAt ? new Date(vuln.modifiedAt) : null,
      });
    }

    const projectRisk = aggregateProjectRisk(riskScores);
    const [updated] = await db
      .update(schema.scans)
      .set({
        status: "completed",
        componentCount: result.componentCount,
        vulnCount: result.vulnerabilities.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        riskScore: projectRisk,
        completedAt: new Date(),
      })
      .where(eq(schema.scans.id, scan.id))
      .returning();

    await publishEvent(natsUrl, EventSubjects.ScanCompleted, {
      scanId: scan.id,
      projectId,
      componentCount: result.componentCount,
      vulnCount: result.vulnerabilities.length,
      riskScore: projectRisk,
      durationMs: result.durationMs,
      completedAt: new Date().toISOString(),
    });
    wsHub.publish(`project:${projectId}`, { kind: "scan:completed", scan: updated });
  } catch (err) {
    logger.error({ err, scanId: scan.id }, "scan execution error");
    await db
      .update(schema.scans)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "unknown error",
        completedAt: new Date(),
      })
      .where(eq(schema.scans.id, scan.id));
    await publishEvent(natsUrl, EventSubjects.ScanFailed, {
      scanId: scan.id,
      projectId,
      error: err instanceof Error ? err.message : String(err),
    });
    wsHub.publish(`project:${projectId}`, { kind: "scan:failed", scanId: scan.id });
  }
}

scansRoute.get("/:id", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
  const db = c.get("db");
  const { id } = c.req.valid("param");
  const [row] = await db.select().from(schema.scans).where(eq(schema.scans.id, id)).limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ scan: row });
});

scansRoute.get(
  "/:id/vulnerabilities",
  zValidator("param", z.object({ id: z.string().uuid() })),
  async (c) => {
    const db = c.get("db");
    const { id } = c.req.valid("param");
    const rows = await db
      .select()
      .from(schema.vulnerabilities)
      .where(eq(schema.vulnerabilities.scanId, id))
      .orderBy(desc(schema.vulnerabilities.aiRiskScore))
      .limit(500);
    return c.json({ vulnerabilities: rows });
  },
);

scansRoute.get(
  "/:id/components",
  zValidator("param", z.object({ id: z.string().uuid() })),
  async (c) => {
    const db = c.get("db");
    const { id } = c.req.valid("param");
    const rows = await db
      .select({
        id: schema.components.id,
        name: schema.components.name,
        version: schema.components.version,
        purl: schema.components.purl,
        ecosystem: schema.components.ecosystem,
        license: schema.components.license,
        licenseRisk: schema.components.licenseRisk,
        isTransitive: schema.components.isTransitive,
      })
      .from(schema.components)
      .where(eq(schema.components.scanId, id))
      .limit(1000);
    return c.json({ components: rows });
  },
);

export { scansRoute };
