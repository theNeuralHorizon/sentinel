// One-shot health diagnostic. Hit /diag and get a JSON report telling
// you exactly which dependency is misconfigured. Useful when boot
// succeeds but a downstream feature is broken — much faster than
// chasing per-service logs in the dashboard.
//
// Public, no auth: it only exposes booleans + sanitised error
// messages, never connection strings or secrets.

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Database } from "@sentinel/db";

type Vars = { db: Database; scannerUrl: string };

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Round-trip ms; useful for spotting cross-region latency. */
  ms: number;
}

async function timed(fn: () => Promise<{ ok: boolean; detail: string }>): Promise<Check & { name: string }> {
  const t0 = Date.now();
  try {
    const { ok, detail } = await fn();
    return { name: "", ok, detail, ms: Date.now() - t0 };
  } catch (err) {
    return {
      name: "",
      ok: false,
      detail: redact(err instanceof Error ? err.message : String(err)),
      ms: Date.now() - t0,
    };
  }
}

/** Strip anything that even smells like a secret out of error strings. */
function redact(msg: string): string {
  return msg
    .replace(/postgres(ql)?:\/\/[^\s"]+/gi, "postgres://[redacted]")
    .replace(/redis:\/\/[^\s"]+/gi, "redis://[redacted]")
    .replace(/\b[A-Za-z0-9+/]{40,}\b/g, "[redacted]")
    .slice(0, 240);
}

export function createDiagnosticsRoute(): Hono<{ Variables: Vars }> {
  const route = new Hono<{ Variables: Vars }>();

  route.get("/", async (c) => {
    const db = c.get("db");
    const scannerUrl = c.get("scannerUrl");

    // Run all probes in parallel — a hung dependency shouldn't block
    // the others from reporting.
    const [pg, sentinelSchema, scanner] = await Promise.all([
      timed(async () => {
        const rows = await db.execute<{ ok: number }>(sql`SELECT 1 AS ok`);
        return { ok: rows[0]?.ok === 1, detail: "SELECT 1 round-tripped" };
      }),
      timed(async () => {
        const rows = await db.execute<{ count: number }>(sql`
          SELECT COUNT(*)::int AS count
          FROM information_schema.tables
          WHERE table_schema = 'sentinel' AND table_name = 'projects'
        `);
        const count = Number(rows[0]?.count ?? 0);
        return {
          ok: count === 1,
          detail: count === 1
            ? "sentinel.projects exists"
            : "sentinel schema not bootstrapped — restart api",
        };
      }),
      timed(async () => {
        if (!scannerUrl || scannerUrl === "") {
          return { ok: false, detail: "SCANNER_URL not set" };
        }
        const res = await fetch(`${scannerUrl.replace(/\/$/, "")}/healthz`, {
          signal: AbortSignal.timeout(5000),
        });
        return {
          ok: res.ok,
          detail: `scanner /healthz → ${res.status}`,
        };
      }),
    ]);

    pg.name = "postgres";
    sentinelSchema.name = "sentinel-schema";
    scanner.name = "scanner";

    const checks: Check[] = [pg, sentinelSchema, scanner];
    const ok = checks.every((c) => c.ok);

    return c.json(
      {
        ok,
        version: "0.1.0",
        env: {
          node_env: process.env.NODE_ENV ?? "unknown",
          llm_provider: process.env.LLM_PROVIDER || "auto",
          has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
          has_google_key: !!process.env.GOOGLE_API_KEY,
        },
        checks,
      },
      ok ? 200 : 503,
    );
  });

  return route;
}
