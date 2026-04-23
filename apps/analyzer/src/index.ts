import { z } from "zod";
import { createDb } from "@sentinel/db";
import { connect, StringCodec } from "nats";
import { EventSubjects } from "@sentinel/shared";
import { startRiskWorker } from "./risk-worker";
import { logger } from "./logger";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  ANALYZER_PORT: z.coerce.number().int().default(4200),
  ANALYZER_BATCH_SIZE: z.coerce.number().int().default(10),
  ANALYZER_CONCURRENCY: z.coerce.number().int().default(4),
  DATABASE_URL: z.string().min(1),
  NATS_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
});
const env = EnvSchema.parse(process.env);

const db = createDb(env.DATABASE_URL);

// Start worker loop.
const stop = startRiskWorker({
  db,
  concurrency: env.ANALYZER_CONCURRENCY,
  batchSize: env.ANALYZER_BATCH_SIZE,
  intervalMs: 3000,
  runLLM: Boolean(env.ANTHROPIC_API_KEY),
});

// Listen on NATS for immediate enrichment requests to skip the poll interval.
(async () => {
  try {
    const nc = await connect({ servers: env.NATS_URL, name: "sentinel-analyzer" });
    const codec = StringCodec();
    const sub = nc.subscribe(EventSubjects.VulnerabilityDiscovered);
    logger.info({ subject: EventSubjects.VulnerabilityDiscovered }, "subscribed to nats");
    for await (const msg of sub) {
      try {
        JSON.parse(codec.decode(msg.data));
        // The worker loop picks up new vulns on next tick; receiving the event
        // is enough of a nudge. This is where we'd fast-path an immediate
        // `analyseOne` call for latency-sensitive deployments.
      } catch (err) {
        logger.warn({ err }, "invalid NATS message");
      }
    }
  } catch (err) {
    logger.warn({ err }, "NATS subscription failed; running in poll-only mode");
  }
})();

// Minimal HTTP health server.
const server = Bun.serve({
  port: env.ANALYZER_PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return Response.json({ ok: true });
    if (url.pathname === "/readyz") return Response.json({ ready: true });
    return new Response("sentinel-analyzer", { status: 200 });
  },
});

logger.info({ port: server.port }, "sentinel-analyzer listening");

// Graceful shutdown.
function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  stop();
  server.stop();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
