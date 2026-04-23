import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";
import { PolicyRulesSchema, evaluatePolicy, type PolicyContext } from "@sentinel/shared";

type Vars = { db: Database };

const policyEvalRoute = new Hono<{ Variables: Vars }>();

const EvalInputSchema = z.object({
  context: z.record(
    z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
  ),
});

// Dry-run evaluation: pass a context, get back which enabled policies match
// and what actions they'd trigger. Useful for CI pre-check gates.
policyEvalRoute.post("/", zValidator("json", EvalInputSchema), async (c) => {
  const db = c.get("db");
  const { context } = c.req.valid("json");
  const rows = await db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.enabled, true))
    .limit(200);

  const matches: Array<{ slug: string; name: string; action: string }> = [];
  for (const p of rows) {
    const rules = PolicyRulesSchema.parse(p.rules);
    const action = evaluatePolicy(rules, context as PolicyContext);
    if (action !== null) {
      matches.push({ slug: p.slug, name: p.name, action });
    }
  }

  // Highest-severity action wins for the overall decision.
  const order = ["allow", "warn", "notify", "remediate", "escalate", "block"];
  const decision = matches.length
    ? matches
        .map((m) => m.action)
        .sort((a, b) => order.indexOf(b) - order.indexOf(a))[0]
    : "allow";

  return c.json({ decision, matches });
});

// Evaluate all open vulnerabilities on a scan against all enabled policies.
const ScanAuditSchema = z.object({ scanId: z.string().uuid() });

policyEvalRoute.post("/scan", zValidator("json", ScanAuditSchema), async (c) => {
  const db = c.get("db");
  const { scanId } = c.req.valid("json");

  const vulns = await db
    .select({
      vuln: schema.vulnerabilities,
      comp: schema.components,
    })
    .from(schema.vulnerabilities)
    .innerJoin(schema.components, eq(schema.components.id, schema.vulnerabilities.componentId))
    .where(eq(schema.vulnerabilities.scanId, scanId))
    .limit(1000);

  const policies = await db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.enabled, true))
    .limit(200);

  const violations: Array<{
    vulnId: string;
    advisoryId: string;
    policySlug: string;
    action: string;
    componentPurl: string;
  }> = [];

  for (const { vuln, comp } of vulns) {
    const ctx: PolicyContext = {
      severity: vuln.severity,
      cvss: vuln.cvssScore ?? 0,
      epss: vuln.epssScore ?? 0,
      aiRiskScore: vuln.aiRiskScore ?? 0,
      exploitability: vuln.exploitability ?? "",
      businessImpact: vuln.businessImpact ?? "",
      ecosystem: comp.ecosystem,
      license: comp.license ?? "",
      licenseRisk: comp.licenseRisk ?? "unknown",
      isTransitive: comp.isTransitive,
      purl: comp.purl,
      componentName: comp.name,
      fixAvailable: vuln.fixedVersions.length > 0,
    };
    for (const p of policies) {
      const rules = PolicyRulesSchema.parse(p.rules);
      const action = evaluatePolicy(rules, ctx);
      if (action !== null) {
        violations.push({
          vulnId: vuln.id,
          advisoryId: vuln.advisoryId,
          policySlug: p.slug,
          action,
          componentPurl: comp.purl,
        });
      }
    }
  }

  return c.json({ scanId, vulnerabilities: vulns.length, violations });
});

export { policyEvalRoute };
