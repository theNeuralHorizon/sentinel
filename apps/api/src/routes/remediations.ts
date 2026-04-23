import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { schema } from "@sentinel/db";
import type { N8nClient } from "../services/n8n";
import { publishEvent } from "../services/events";
import { EventSubjects } from "@sentinel/shared";

type Vars = { db: Database; n8n: N8nClient; natsUrl: string };

const remediationsRoute = new Hono<{ Variables: Vars }>();

remediationsRoute.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db
    .select()
    .from(schema.remediations)
    .orderBy(desc(schema.remediations.createdAt))
    .limit(200);
  return c.json({ remediations: rows });
});

const ApproveSchema = z.object({
  approvedBy: z.string().min(1),
});

remediationsRoute.post(
  "/:id/approve",
  zValidator("param", z.object({ id: z.string().uuid() })),
  zValidator("json", ApproveSchema),
  async (c) => {
    const db = c.get("db");
    const n8n = c.get("n8n");
    const natsUrl = c.get("natsUrl");
    const { id } = c.req.valid("param");
    const { approvedBy } = c.req.valid("json");

    const [row] = await db
      .select()
      .from(schema.remediations)
      .where(and(eq(schema.remediations.id, id), eq(schema.remediations.state, "proposed")))
      .limit(1);
    if (!row) return c.json({ error: "not_found_or_not_proposed" }, 404);

    const [updated] = await db
      .update(schema.remediations)
      .set({
        state: "queued",
        approvedBy,
        approvedAt: new Date(),
      })
      .where(eq(schema.remediations.id, id))
      .returning();
    if (!updated) throw new Error("update returned no rows");

    await publishEvent(natsUrl, EventSubjects.RemediationApproved, {
      remediationId: id,
      approvedBy,
    });

    // Dispatch immediately. In a more cautious deployment this would go via
    // NATS and a worker; for demo we call n8n from the API for simplicity.
    try {
      const workflow = updated.workflowId ?? `sentinel-${updated.kind}`;
      const execution = await n8n.triggerWebhook(workflow, {
        remediationId: updated.id,
        vulnerabilityId: updated.vulnerabilityId,
        kind: updated.kind,
        parameters: updated.parameters,
      });
      const [dispatched] = await db
        .update(schema.remediations)
        .set({
          state: "dispatched",
          executionId: execution.executionId,
          dispatchedAt: new Date(),
        })
        .where(eq(schema.remediations.id, id))
        .returning();

      await publishEvent(natsUrl, EventSubjects.RemediationDispatched, {
        remediationId: id,
        executionId: execution.executionId,
      });
      return c.json({ remediation: dispatched });
    } catch (err) {
      await db
        .update(schema.remediations)
        .set({
          state: "failed",
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        .where(eq(schema.remediations.id, id));
      return c.json({ error: "dispatch_failed", detail: String(err) }, 502);
    }
  },
);

export { remediationsRoute };
