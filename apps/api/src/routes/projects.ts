import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";

const projectsRoute = new Hono<{ Variables: { db: Database } }>();

const CreateProjectSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  repoUrl: z.string().url().optional(),
  defaultBranch: z.string().default("main"),
  tags: z.array(z.string()).default([]),
});

projectsRoute.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select()
    .from(schema.projects)
    .orderBy(desc(schema.projects.createdAt))
    .limit(200);
  return c.json({ projects: rows });
});

projectsRoute.post("/", zValidator("json", CreateProjectSchema), async (c) => {
  const db = c.get("db");
  const input = c.req.valid("json");
  const [row] = await db
    .insert(schema.projects)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      repoUrl: input.repoUrl ?? null,
      defaultBranch: input.defaultBranch,
      tags: input.tags,
    })
    .returning();
  return c.json({ project: row }, 201);
});

projectsRoute.get(
  "/:slug",
  zValidator("param", z.object({ slug: z.string() })),
  async (c) => {
    const db = c.get("db");
    const { slug } = c.req.valid("param");
    const [row] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.slug, slug))
      .limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ project: row });
  },
);

projectsRoute.get(
  "/:slug/scans",
  zValidator("param", z.object({ slug: z.string() })),
  async (c) => {
    const db = c.get("db");
    const { slug } = c.req.valid("param");
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.slug, slug))
      .limit(1);
    if (!project) return c.json({ error: "not_found" }, 404);

    const rows = await db
      .select()
      .from(schema.scans)
      .where(eq(schema.scans.projectId, project.id))
      .orderBy(desc(schema.scans.createdAt))
      .limit(50);
    return c.json({ scans: rows });
  },
);

export { projectsRoute };
