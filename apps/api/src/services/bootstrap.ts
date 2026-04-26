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

export async function bootstrapSchema(db: Database): Promise<void> {
  logger.info("bootstrap: starting");
  const path = findMigration();
  const migrationSql = readFileSync(path, "utf8");
  logger.info({ migration: path, bytes: migrationSql.length }, "bootstrap: migration loaded");

  // Per-statement guard: if the DB is unhealthy or sitting behind a
  // long-running session, every DDL we issue dies in 60s instead of
  // blocking the boot indefinitely. postgres-js opens a fresh session
  // for each pool connection so this lives for the duration of the
  // bootstrap call.
  await db.execute(sql.raw(`SET statement_timeout = '60s'; SET lock_timeout = '5s';`));
  logger.info("bootstrap: timeouts configured (statement=60s lock=5s)");

  // Try for the advisory lock with a tight timeout. Free tier runs a
  // single instance (numInstances=1) so we never *need* the lock —
  // it was insurance against rolling deploys. If it can't be acquired
  // in 5s (zombie session from a crashed prior boot, etc.) we proceed
  // anyway: every DDL below is `IF NOT EXISTS` so re-running is safe.
  let haveLock = false;
  try {
    await db.execute(sql`SELECT pg_advisory_lock(${BOOTSTRAP_LOCK_KEY}::bigint)`);
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
    await db.execute(sql.raw(prelude));
    logger.info("bootstrap: applying init migration (tables + indexes)");
    await db.execute(sql.raw(migrationSql));
    logger.info({ migration: path }, "bootstrap: schema ready (sentinel)");
  } catch (err) {
    logger.error({ err }, "bootstrap: failed to apply migration");
    throw err;
  } finally {
    if (haveLock) {
      // Best-effort unlock; the lock dies with the connection anyway,
      // so we don't let a failed unlock mask the real bootstrap result.
      await db
        .execute(sql`SELECT pg_advisory_unlock(${BOOTSTRAP_LOCK_KEY}::bigint)`)
        .catch((err) => logger.warn({ err }, "bootstrap: advisory unlock failed"));
    }
  }
}
