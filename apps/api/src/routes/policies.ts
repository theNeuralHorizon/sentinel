import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";
import { PolicyRulesSchema } from "@sentinel/shared";

type Vars = { db: Database };

const policiesRoute = new Hono<{ Variables: Vars }>();

const PolicyUpsertSchema = z.object({
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().default(true),
  rules: PolicyRulesSchema,
  tags: z.array(z.string()).default([]),
});

policiesRoute.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select()
    .from(schema.policies)
    .orderBy(desc(schema.policies.createdAt))
    .limit(200);
  return c.json({ policies: rows });
});

policiesRoute.post("/", zValidator("json", PolicyUpsertSchema), async (c) => {
  const db = c.get("db");
  const input = c.req.valid("json");
  const [row] = await db
    .insert(schema.policies)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      enabled: input.enabled,
      rules: input.rules,
      tags: input.tags,
    })
    .returning();
  return c.json({ policy: row }, 201);
});

policiesRoute.put(
  "/:slug",
  zValidator("param", z.object({ slug: z.string() })),
  zValidator("json", PolicyUpsertSchema.partial()),
  async (c) => {
    const db = c.get("db");
    const { slug } = c.req.valid("param");
    const input = c.req.valid("json");
    const [row] = await db
      .update(schema.policies)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.rules !== undefined && { rules: input.rules }),
        ...(input.tags !== undefined && { tags: input.tags }),
        updatedAt: new Date(),
      })
      .where(eq(schema.policies.slug, slug))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ policy: row });
  },
);

export { policiesRoute };
