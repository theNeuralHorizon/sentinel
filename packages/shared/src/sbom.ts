import { z } from "zod";

// Minimal, opinionated SBOM types used internally.
// We convert to/from CycloneDX 1.6 and SPDX 3.0 at the edges.

export const EcosystemSchema = z.enum([
  "npm",
  "pypi",
  "cargo",
  "gomodules",
  "maven",
  "nuget",
  "rubygems",
  "composer",
  "container",
  "ml_model",
  "dataset",
  "mcp_server",
  "other",
]);
export type Ecosystem = z.infer<typeof EcosystemSchema>;

export const SeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const ComponentSchema = z.object({
  ecosystem: EcosystemSchema,
  name: z.string().min(1),
  version: z.string().min(1),
  purl: z.string().min(1),
  cpe: z.string().optional(),
  supplier: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  license: z.string().optional(),
  licenseConfidence: z.enum(["declared", "concluded", "unknown"]).optional(),
  isTransitive: z.boolean().default(false),
  directDependents: z.array(z.string()).default([]),
  hashSha256: z.string().optional(),
});
export type SBomComponent = z.infer<typeof ComponentSchema>;

export const VulnerabilityRefSchema = z.object({
  advisoryId: z.string(),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  details: z.string().optional(),
  severity: SeveritySchema,
  cvssScore: z.number().min(0).max(10).optional(),
  cvssVector: z.string().optional(),
  epssScore: z.number().min(0).max(1).optional(),
  fixedVersions: z.array(z.string()).default([]),
  affectedRanges: z.array(z.record(z.unknown())).default([]),
  references: z.array(z.object({ type: z.string(), url: z.string() })).default([]),
  publishedAt: z.string().datetime().optional(),
  modifiedAt: z.string().datetime().optional(),
});
export type VulnerabilityRef = z.infer<typeof VulnerabilityRefSchema>;

export const ScanRequestSchema = z.object({
  projectId: z.string().uuid(),
  projectSlug: z.string().optional(),
  gitRef: z.string().optional(),
  commitSha: z.string().optional(),
  workDir: z.string(),
  kind: z.enum(["full", "incremental", "drift", "ml_bom"]).default("full"),
  ecosystems: z.array(EcosystemSchema).optional(),
  triggeredBy: z.string().default("api"),
});
export type ScanRequest = z.infer<typeof ScanRequestSchema>;

export const ScanResultSchema = z.object({
  scanId: z.string().uuid(),
  status: z.enum(["completed", "failed"]),
  componentCount: z.number().int().nonnegative(),
  vulnCount: z.number().int().nonnegative(),
  components: z.array(ComponentSchema),
  vulnerabilities: z.array(
    z.object({
      componentPurl: z.string(),
      vuln: VulnerabilityRefSchema,
    }),
  ),
  sbomFormat: z.enum(["cyclonedx-1.6", "spdx-3.0"]),
  sbomContent: z.string(),
  errorMessage: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
