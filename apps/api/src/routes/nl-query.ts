import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql, eq } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";
import {
  createAiClient,
  DEFAULT_MODEL,
  extractJson,
  componentEmbeddingText,
  createDefaultEmbedder,
  prompts,
} from "@sentinel/ai";
import { logger } from "../logger";

type Vars = { db: Database };

const nlRoute = new Hono<{ Variables: Vars }>();

const NlQueryPlanSchema = z.object({
  mode: z.enum([
    "similarity_search",
    "vulnerability_lookup",
    "component_lookup",
    "policy_audit",
    "drift_diff",
  ]),
  parameters: z.record(z.unknown()),
  natural_summary: z.string(),
});

const NlQueryRequestSchema = z.object({
  question: z.string().min(3).max(1000),
});

nlRoute.post("/", zValidator("json", NlQueryRequestSchema), async (c) => {
  const db = c.get("db");
  const { question } = c.req.valid("json");

  let plan: z.infer<typeof NlQueryPlanSchema>;
  const hasLLM = Boolean(process.env.ANTHROPIC_API_KEY);
  if (hasLLM) {
    try {
      const client = createAiClient();
      const ctxSummary = await buildContextSummary(db);
      const message = await client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 500,
        system: [
          {
            type: "text",
            text: prompts.NL_QUERY_SYSTEM,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompts.buildNlQueryPrompt(question, ctxSummary) }],
      });
      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("no text block from model");
      }
      plan = NlQueryPlanSchema.parse(extractJson(textBlock.text));
    } catch (err) {
      logger.warn({ err }, "NL planner LLM call failed, falling back");
      plan = heuristicPlan(question);
    }
  } else {
    plan = heuristicPlan(question);
  }

  const results = await executePlan(db, plan);
  return c.json({ plan, results });
});

async function buildContextSummary(db: Database): Promise<string> {
  const [row] = await db.execute<{ projects: string; components: string; open: string }>(sql`
    SELECT
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM components) AS components,
      (SELECT COUNT(*) FROM vulnerabilities WHERE state = 'open') AS open
  `);
  return `Projects: ${row?.projects ?? 0}. Components indexed: ${row?.components ?? 0}. Open vulnerabilities: ${row?.open ?? 0}.`;
}

// Regex-based fallback so the NL endpoint never requires an API key to be useful.
function heuristicPlan(question: string): z.infer<typeof NlQueryPlanSchema> {
  const q = question.toLowerCase();
  const cveMatch = q.match(/(cve-\d{4}-\d{4,7}|ghsa-[a-z0-9-]+)/i);
  if (cveMatch) {
    return {
      mode: "vulnerability_lookup",
      parameters: { advisory_or_alias: cveMatch[1] },
      natural_summary: `Looking up advisory ${cveMatch[1]}.`,
    };
  }
  const exposureMatch = q.match(/exposure to (.+)$/);
  if (exposureMatch) {
    return {
      mode: "similarity_search",
      parameters: { query_text: exposureMatch[1]!.trim(), top_k: 20 },
      natural_summary: `Semantic search for components similar to "${exposureMatch[1]!.trim()}".`,
    };
  }
  return {
    mode: "similarity_search",
    parameters: { query_text: question, top_k: 20 },
    natural_summary: `Semantic search across components using your question verbatim.`,
  };
}

async function executePlan(
  db: Database,
  plan: z.infer<typeof NlQueryPlanSchema>,
): Promise<unknown> {
  switch (plan.mode) {
    case "similarity_search": {
      const queryText = String(plan.parameters.query_text ?? "");
      const topK = Math.min(Number(plan.parameters.top_k ?? 20), 100);
      const embedder = createDefaultEmbedder();
      const [vec] = await embedder.embed([
        componentEmbeddingText({
          name: queryText,
          version: "*",
          ecosystem: "unknown",
          purl: `pkg:search/${queryText}`,
        }),
      ]);
      if (!vec || vec.length === 0) {
        // Embedder unavailable — return an empty result rather than
        // throw. The user got their plan back; the data plane just
        // had nothing to compare.
        return [];
      }
      const literal = `[${vec.join(",")}]`;
      return db.execute(sql`
        SELECT c.id, c.name, c.version, c.ecosystem, c.purl, c.license,
               1 - (c.embedding <=> ${literal}::vector) AS similarity
        FROM components c
        WHERE c.embedding IS NOT NULL
        ORDER BY c.embedding <=> ${literal}::vector ASC
        LIMIT ${topK}
      `);
    }
    case "vulnerability_lookup": {
      const needle = String(plan.parameters.advisory_or_alias ?? "").toUpperCase();
      return db.execute(sql`
        SELECT v.id, v.advisory_id AS "advisoryId", v.aliases, v.summary,
               v.severity, v.cvss_score AS "cvssScore", v.ai_risk_score AS "aiRiskScore",
               c.name AS "componentName", c.version AS "componentVersion"
        FROM vulnerabilities v
        JOIN components c ON c.id = v.component_id
        WHERE UPPER(v.advisory_id) = ${needle}
           OR ${needle} = ANY (ARRAY(SELECT UPPER(x) FROM UNNEST(v.aliases) x))
        LIMIT 50
      `);
    }
    case "component_lookup": {
      const name = String(plan.parameters.name ?? "");
      return db.execute(sql`
        SELECT c.id, c.name, c.version, c.ecosystem, c.purl, c.license, c.is_transitive
        FROM components c
        WHERE c.name ILIKE ${"%" + name + "%"}
        ORDER BY c.created_at DESC
        LIMIT 100
      `);
    }
    case "policy_audit": {
      const slug = String(plan.parameters.policy_slug ?? "");
      const [policy] = await db
        .select()
        .from(schema.policies)
        .where(eq(schema.policies.slug, slug))
        .limit(1);
      if (!policy) return { error: "policy_not_found" };
      // Minimal impl: echo the policy back. A full audit would evaluate every
      // open vulnerability against the policy's conditions.
      return { policy };
    }
    case "drift_diff": {
      const base = String(plan.parameters.base_scan ?? "");
      const head = String(plan.parameters.head_scan ?? "");
      return db.execute(sql`
        WITH base_components AS (
          SELECT purl, version FROM components WHERE scan_id = ${base}
        ),
        head_components AS (
          SELECT purl, version FROM components WHERE scan_id = ${head}
        )
        SELECT
          COALESCE(b.purl, h.purl) AS purl,
          b.version AS base_version,
          h.version AS head_version,
          CASE
            WHEN b.purl IS NULL THEN 'added'
            WHEN h.purl IS NULL THEN 'removed'
            WHEN b.version <> h.version THEN 'changed'
            ELSE 'stable'
          END AS change
        FROM base_components b
        FULL OUTER JOIN head_components h ON b.purl = h.purl
        WHERE b.version IS NULL OR h.version IS NULL OR b.version <> h.version
        ORDER BY change, purl
      `);
    }
  }
}

export { nlRoute };
