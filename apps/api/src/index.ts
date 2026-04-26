import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { StringCodec, type NatsConnection } from "nats";

import { loadEnv, parseAllowedOrigins } from "./env";
import { logger } from "./logger";
import { createDb } from "@sentinel/db";
import { createAuthMiddleware } from "./middleware/auth";
import { createRateLimitMiddleware } from "./middleware/rate-limit";
import { ScannerClient } from "./services/scanner";
import { N8nClient } from "./services/n8n";
import { createWsHub } from "./services/ws-hub";
import { getNats } from "./services/events";
import { projectsRoute } from "./routes/projects";
import { scansRoute } from "./routes/scans";
import { searchRoute } from "./routes/search";
import { remediationsRoute } from "./routes/remediations";
import { policiesRoute } from "./routes/policies";
import { metricsRoute } from "./routes/metrics";
import { nlRoute } from "./routes/nl-query";
import { policyEvalRoute } from "./routes/policy-eval";
import { createVersionRoute } from "./routes/version";
import { createAuthRoute } from "./routes/auth";
import { createAdminRoute } from "./routes/admin";
import { createDiagnosticsRoute } from "./routes/diagnostics";
import { jwtVerify } from "jose";

// Co-located analyzer: same risk-worker as the standalone analyzer service,
// started in-process so a single Render free web service handles both.
import { startRiskWorker } from "../../analyzer/src/risk-worker";
import { bootstrapSchema } from "./services/bootstrap";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

// Boot state — flipped by the background bootstrap task. /readyz and
// the /v1 middleware look at this; while it's false the API answers
// /healthz only so Render's port-scanner sees the port bound.
type BootState = { ready: boolean; error: string | null };
const bootState: BootState = { ready: false, error: null };

// Apply the schema (CREATE TABLE IF NOT EXISTS …) before any /v1 route
// can hit the database. We DO NOT await this at the top level — that
// would block Bun.serve from binding the port, and Render's port scanner
// times out at 2 min. Instead we kick it off as a background promise
// and gate /v1 routes behind `bootState.ready`.
function startBootstrap(): void {
  if (process.env.SKIP_BOOTSTRAP === "1") {
    bootState.ready = true;
    logger.info("SKIP_BOOTSTRAP=1; skipping schema bootstrap");
    return;
  }
  bootstrapSchema(db)
    .then(() => {
      bootState.ready = true;
      logger.info("bootstrap complete; /v1 routes online");
    })
    .catch((err) => {
      bootState.error = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "bootstrap failed; /v1 routes will return 503");
    });
}
const scanner = new ScannerClient(env.SCANNER_URL);
const n8n = new N8nClient({
  baseUrl: env.N8N_URL ?? "http://localhost:5678",
  apiKey: env.N8N_API_KEY ?? "",
  webhookBase: env.N8N_WEBHOOK_BASE ?? "",
});
const wsHub = createWsHub();
const codec = StringCodec();

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

const app = new Hono();

app.use("*", honoLogger((msg, ...rest) => logger.info({ rest }, msg)));
app.use("*", secureHeaders());
const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS, env.NODE_ENV);
app.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);
logger.info({ allowedOrigins }, "CORS allowlist loaded");
app.use("*", createRateLimitMiddleware({ redisUrl: env.REDIS_URL, limit: env.API_RATE_LIMIT_PER_MIN }));

// Unauthenticated routes.
app.get("/", (c) => c.json({ service: "sentinel-api", version: "0.1.0" }));
// /healthz: liveness — answers 200 the moment the port is bound, even
// before the database bootstrap has run. Render's port scanner relies
// on this happening within ~120s.
app.get("/healthz", (c) => c.json({ ok: true }));
// /readyz: readiness — only 200 once the bootstrap promise has resolved.
// If it never resolves, returns 503 with the captured error message.
app.get("/readyz", (c) => {
  if (bootState.ready) {
    return c.json({ ready: true, wsClients: wsHub.size() });
  }
  return c.json({ ready: false, error: bootState.error }, 503);
});
app.route("/version", createVersionRoute());
app.route("/v1/auth", createAuthRoute(env.API_JWT_SECRET));

// Gate all DB-touching routes behind the bootstrap completion. While
// bootstrap is in flight, /v1/* responds 503; healthz/readyz/diag stay
// reachable so operators (and Render's port scanner) can see liveness.
const requireReady: MiddlewareHandler = async (c, next) => {
  if (!bootState.ready) {
    return c.json(
      { error: "bootstrapping", detail: bootState.error ?? "schema bootstrap in progress" },
      503,
    );
  }
  await next();
};

// Admin: token-gated. Used once after deploy to seed demo data via curl.
const adminApp = new Hono();
adminApp.use("*", requireReady);
adminApp.use("*", async (c, next) => {
  c.set("db" as never, db);
  return next();
});
adminApp.route("/", createAdminRoute());
app.route("/v1/admin", adminApp);

// Diagnostics surface — public, but only exposes booleans + redacted
// error messages. Hit GET /diag to see which dependency is broken.
const diagApp = new Hono();
diagApp.use("*", async (c, next) => {
  c.set("db" as never, db);
  c.set("scannerUrl" as never, env.SCANNER_URL);
  return next();
});
diagApp.route("/", createDiagnosticsRoute());
app.route("/diag", diagApp);

// Authenticated routes.
const authed = new Hono();
authed.use("*", requireReady);
authed.use("*", createAuthMiddleware(env.API_JWT_SECRET));
authed.use("*", async (c, next) => {
  c.set("db" as never, db);
  c.set("scanner" as never, scanner);
  c.set("n8n" as never, n8n);
  c.set("natsUrl" as never, env.NATS_URL);
  c.set("wsHub" as never, wsHub);
  return next();
});
authed.route("/projects", projectsRoute);
authed.route("/scans", scansRoute);
authed.route("/search", searchRoute);
authed.route("/remediations", remediationsRoute);
authed.route("/policies", policiesRoute);
authed.route("/metrics", metricsRoute);
authed.route("/nl", nlRoute);
authed.route("/policy-eval", policyEvalRoute);
app.route("/v1", authed);

// WebSocket for real-time dashboard updates.
// JWT in query string because browser WebSocket can't set headers.
app.get(
  "/ws",
  upgradeWebSocket(async (c) => {
    const token = c.req.query("token");
    const topicsRaw = c.req.query("topics") ?? "";
    const topics = topicsRaw.split(",").map((t) => t.trim()).filter(Boolean);

    if (!token) {
      return {
        onOpen(_evt, ws) {
          ws.close(1008, "missing_token");
        },
      };
    }

    try {
      const key = new TextEncoder().encode(env.API_JWT_SECRET);
      await jwtVerify(token, key, { algorithms: ["HS256"] });
    } catch {
      return {
        onOpen(_evt, ws) {
          ws.close(1008, "invalid_token");
        },
      };
    }

    return {
      onOpen(_evt, ws) {
        wsHub.subscribe(ws.raw as unknown as WebSocket, topics);
        ws.send(JSON.stringify({ kind: "connected", topics }));
      },
      onClose(_evt, ws) {
        wsHub.unsubscribe(ws.raw as unknown as WebSocket);
      },
      onMessage(evt, ws) {
        try {
          const msg = JSON.parse(String(evt.data)) as { type: string; topics?: string[] };
          if (msg.type === "subscribe" && Array.isArray(msg.topics)) {
            wsHub.subscribe(ws.raw as unknown as WebSocket, msg.topics);
            ws.send(JSON.stringify({ kind: "subscribed", topics: msg.topics }));
          }
        } catch {
          // ignore malformed messages
        }
      },
    };
  }),
);

// Bridge NATS → WebSocket hub. Fire-and-forget; retried by NATS reconnect.
// If NATS_URL is empty (single-region Render deploy without NATS), we skip
// the bridge entirely — the UI still renders and API still serves, but the
// live-activity feed falls back to polling.
async function startNatsBridge(): Promise<void> {
  if (!env.NATS_URL || env.NATS_URL.trim() === "") {
    logger.warn("NATS_URL not set; real-time event bridge disabled (polling-only mode)");
    return;
  }
  try {
    const nc: NatsConnection = await getNats(env.NATS_URL);
    const sub = nc.subscribe("sentinel.>");
    (async () => {
      for await (const msg of sub) {
        try {
          const payload = JSON.parse(codec.decode(msg.data)) as Record<string, unknown>;
          const projectId = payload.projectId as string | undefined;
          if (projectId) {
            wsHub.publish(`project:${projectId}`, { kind: msg.subject, payload });
          }
          const scanId = payload.scanId as string | undefined;
          if (scanId) {
            wsHub.publish(`scan:${scanId}`, { kind: msg.subject, payload });
          }
          wsHub.publish("global", { kind: msg.subject, payload });
        } catch (err) {
          logger.warn({ err }, "failed to forward NATS message");
        }
      }
    })();
    logger.info("NATS bridge online");
  } catch (err) {
    logger.warn({ err }, "NATS bridge failed to start; real-time will be degraded");
  }
}
startNatsBridge();

// Bind the port FIRST. Render's port scanner has a hard 120s budget;
// blocking on bootstrap before this line is what was causing the
// scanner-timeout-then-OOM pattern in the deploy logs. Everything
// below (bootstrap, NATS, analyzer) runs in the background while the
// port stays bound and /healthz answers 200.
const server = Bun.serve({
  port: env.API_PORT,
  hostname: env.API_HOST,
  fetch: app.fetch,
  websocket,
});

logger.info({ url: `http://${server.hostname}:${server.port}` }, "sentinel-api listening");

// Kick off schema bootstrap in the background. /v1 routes return 503
// until this resolves; /healthz keeps answering 200 throughout.
startBootstrap();

// Co-located analyzer worker: enrich vulnerabilities with risk scores +
// remediations on a 3s tick. Set ANALYZER_DISABLED=1 to skip. We defer
// startup until the bootstrap promise has settled — starting it before
// the schema exists would just spam errors into the logs.
if (process.env.ANALYZER_DISABLED !== "1") {
  const waitThenStart = async () => {
    while (!bootState.ready && bootState.error === null) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (bootState.error !== null) {
      logger.warn({ error: bootState.error }, "analyzer not started; bootstrap failed");
      return;
    }
    startRiskWorker({
      db,
      concurrency: Number(process.env.ANALYZER_CONCURRENCY ?? 4),
      batchSize: Number(process.env.ANALYZER_BATCH_SIZE ?? 10),
      intervalMs: 3000,
      runLLM: Boolean(env.ANTHROPIC_API_KEY),
    });
    logger.info(
      { runLLM: Boolean(env.ANTHROPIC_API_KEY) },
      "analyzer worker started in-process",
    );
  };
  void waitThenStart();
}
