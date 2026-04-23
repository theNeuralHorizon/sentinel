import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql, eq, and } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";
import { componentEmbeddingText, createDefaultEmbedder } from "@sentinel/ai";

type Vars = { db: Database };

const searchRoute = new Hono<{ Variables: Vars }>();

const SimilaritySchema = z.object({
  query: z.string().min(1).max(500),
  topK: z.number().int().min(1).max(100).default(20),
  ecosystem: z.string().optional(),
});

// Semantic similarity search across the component graph.
// Uses pgvector cosine distance (`<=>` operator).
searchRoute.post("/similar", zValidator("json", SimilaritySchema), async (c) => {
  const db = c.get("db");
  const { query, topK, ecosystem } = c.req.valid("json");

  const embedder = createDefaultEmbedder();
  const [vec] = await embedder.embed([
    componentEmbeddingText({
      name: query,
      version: "*",
      ecosystem: ecosystem ?? "unknown",
      purl: `pkg:search/${query}`,
    }),
  ]);
  const vectorLiteral = `[${vec!.join(",")}]`;

  // Drizzle doesn't have first-class pgvector operators yet, so we express
  // the query with raw SQL. The `<=>` is cosine distance; lower = more similar.
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.name,
      c.version,
      c.ecosystem,
      c.purl,
      c.license,
      c.license_risk AS "licenseRisk",
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM components c
    WHERE c.embedding IS NOT NULL
      ${ecosystem ? sql`AND c.ecosystem = ${ecosystem}::ecosystem` : sql``}
    ORDER BY c.embedding <=> ${vectorLiteral}::vector ASC
    LIMIT ${topK}
  `);

  return c.json({ results: rows });
});

const ComponentSearchSchema = z.object({
  name: z.string().optional(),
  purl: z.string().optional(),
  ecosystem: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

searchRoute.get("/components", zValidator("query", ComponentSearchSchema), async (c) => {
  const db = c.get("db");
  const q = c.req.valid("query");
  const conditions = [];
  if (q.name) conditions.push(sql`c.name ILIKE ${"%" + q.name + "%"}`);
  if (q.purl) conditions.push(eq(schema.components.purl, q.purl));
  if (q.ecosystem) conditions.push(sql`c.ecosystem = ${q.ecosystem}::ecosystem`);
  if (q.projectId) conditions.push(eq(schema.components.projectId, q.projectId));

  const rows = await db.execute(sql`
    SELECT c.id, c.name, c.version, c.ecosystem, c.purl, c.license, c.license_risk AS "licenseRisk"
    FROM components c
    ${conditions.length > 0 ? sql`WHERE ${and(...conditions)}` : sql``}
    ORDER BY c.created_at DESC
    LIMIT 200
  `);

  return c.json({ components: rows });
});

export { searchRoute };
