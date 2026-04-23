import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { StringCodec, type NatsConnection } from "nats";

import { loadEnv } from "./env";
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
import { jwtVerify } from "jose";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
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
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);
app.use("*", createRateLimitMiddleware({ redisUrl: env.REDIS_URL, limit: env.API_RATE_LIMIT_PER_MIN }));

// Unauthenticated routes.
app.get("/", (c) => c.json({ service: "sentinel-api", version: "0.1.0" }));
app.get("/healthz", (c) => c.json({ ok: true }));
app.get("/readyz", (c) => c.json({ ready: true, wsClients: wsHub.size() }));
app.route("/version", createVersionRoute());
app.route("/v1/auth", createAuthRoute(env.API_JWT_SECRET));

// Authenticated routes.
const authed = new Hono();
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
async function startNatsBridge(): Promise<void> {
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

const server = Bun.serve({
  port: env.API_PORT,
  hostname: env.API_HOST,
  fetch: app.fetch,
  websocket,
});

logger.info({ url: `http://${server.hostname}:${server.port}` }, "sentinel-api listening");
