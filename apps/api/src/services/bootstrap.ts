// Idempotent bootstrap that runs once at API boot.
//
// Why this exists: Render's free tier limits an account to one Postgres
// instance. The user already has one (`claimrail-db`), so Sentinel shares
// it via a dedicated `sentinel` schema. Rather than asking the operator
// to run psql by hand, we ship the migration in the API container and
// apply it on startup. The 0000_init.sql is built with `IF NOT EXISTS`
// guards everywhere, so re-running on every boot is safe.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import type { Database } from "@sentinel/db";
import { logger } from "../logger";

// Each candidate is a place the migration file might live, depending on
// where the API is being run from (Docker /app, local repo root, monorepo).
const CANDIDATES = [
  "packages/db/migrations/0000_init.sql",
  "../packages/db/migrations/0000_init.sql",
  "../../packages/db/migrations/0000_init.sql",
  "/app/packages/db/migrations/0000_init.sql",
];

function findMigration(): string {
  for (const rel of CANDIDATES) {
    const abs = resolve(process.cwd(), rel);
    if (existsSync(abs)) return abs;
  }
  throw new Error(
    `0000_init.sql not found. Looked in: ${CANDIDATES.join(", ")} (cwd=${process.cwd()})`,
  );
}

/**
 * Apply the initial schema to a `sentinel` namespace. Re-running is a no-op.
 *
 *   1. CREATE SCHEMA IF NOT EXISTS sentinel
 *   2. CREATE EXTENSION IF NOT EXISTS pgcrypto, vector  (in public)
 *   3. SET search_path = sentinel, public               (this connection only)
 *   4. Replay 0000_init.sql                             (table creates, indexes, enums)
 */
// Postgres advisory-lock key. Anything int8-fitting works; we pick a
// readable constant so it's obvious in pg_locks who owns it.
const BOOTSTRAP_LOCK_KEY = 4242000000000001n;

/**
 * Promise.race wrapper that rejects after `ms` if the wrapped promise
 * hasn't settled. Drizzle / postgres-js silently swallows
 * `connect_timeout` in some failure modes (TLS handshake stalled, pool
 * exhausted, etc.), so we belt-and-braces it here. Every db call in
 * bootstrap goes through this — if any step hangs, /readyz surfaces
 * the timeout instead of returning ready=false forever.
 */
async function withTimeout<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`bootstrap step "${label}" timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function bootstrapSchema(db: Database): Promise<void> {
  logger.info("bootstrap: starting");
  const path = findMigration();
  const migrationSql = readFileSync(path, "utf8");
  logger.info({ migration: path, bytes: migrationSql.length }, "bootstrap: migration loaded");

  // Connection probe. If the pool is dead / firewalled / TLS-stuck,
  // this fails in 15s with a visible error rather than blocking the
  // whole boot indefinitely. The previous deploy hung silently here
  // (no log between "migration loaded" and the next step) — the
  // explicit timeout ensures the failure surfaces in /readyz.
  logger.info("bootstrap: probing DB connection (SELECT 1)");
  await withTimeout("connect-probe", 15_000, db.execute(sql`SELECT 1 AS ok`));
  logger.info("bootstrap: connection ok");

  // Per-statement guard: if a DDL is contended, every statement we
  // issue dies in 60s instead of blocking the boot indefinitely.
  await withTimeout(
    "set-timeouts",
    10_000,
    db.execute(sql.raw(`SET statement_timeout = '60s'; SET lock_timeout = '5s';`)),
  );
  logger.info("bootstrap: timeouts configured (statement=60s lock=5s)");

  // Try for the advisory lock with a tight timeout. Free tier runs a
  // single instance (numInstances=1) so we never *need* the lock —
  // it was insurance against rolling deploys. If it can't be acquired
  // (zombie session from a prior crashed boot, etc.) we proceed: every
  // DDL below is `IF NOT EXISTS` so re-running is safe.
  let haveLock = false;
  try {
    await withTimeout(
      "advisory-lock",
      8_000,
      db.execute(sql`SELECT pg_advisory_lock(${BOOTSTRAP_LOCK_KEY}::bigint)`),
    );
    haveLock = true;
    logger.info("bootstrap: advisory lock acquired");
  } catch (err) {
    logger.warn({ err }, "bootstrap: advisory lock unavailable; proceeding without it");
  }

  // Steps 1-3: the prelude ensures the next statements land in the
  // sentinel schema regardless of what the connection's default was.
  // pgcrypto + vector live in `public` so multiple schemas in the same
  // database can share them.
  const prelude = `
    CREATE SCHEMA IF NOT EXISTS sentinel;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS vector;
    SET search_path TO sentinel, public;
  `;

  try {
    logger.info("bootstrap: applying prelude (schema + extensions)");
    await withTimeout("prelude", 30_000, db.execute(sql.raw(prelude)));
    logger.info("bootstrap: applying init migration (tables + indexes)");
    await withTimeout("init-migration", 90_000, db.execute(sql.raw(migrationSql)));
    logger.info({ migration: path }, "bootstrap: schema ready (sentinel)");
  } catch (err) {
    logger.error({ err }, "bootstrap: failed to apply migration");
    throw err;
  } finally {
    if (haveLock) {
      await withTimeout(
        "advisory-unlock",
        5_000,
        db.execute(sql`SELECT pg_advisory_unlock(${BOOTSTRAP_LOCK_KEY}::bigint)`),
      ).catch((err) => logger.warn({ err }, "bootstrap: advisory unlock failed"));
    }
  }
}
