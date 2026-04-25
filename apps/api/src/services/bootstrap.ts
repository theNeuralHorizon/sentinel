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
  const path = findMigration();
  const migrationSql = readFileSync(path, "utf8");

  // Acquire an advisory lock so a Render rolling deploy (multiple pods
  // booting at the same time) can't race on CREATE EXTENSION / CREATE
  // TYPE — those produce duplicate_object errors that crash boot
  // even when wrapped in `IF NOT EXISTS` guards. The lock is released
  // automatically when this connection ends; we also unlock explicitly.
  try {
    await db.execute(sql`SELECT pg_advisory_lock(${BOOTSTRAP_LOCK_KEY}::bigint)`);
  } catch (err) {
    logger.error({ err }, "bootstrap: failed to acquire advisory lock");
    throw err;
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
    await db.execute(sql.raw(prelude));
    await db.execute(sql.raw(migrationSql));
    logger.info({ migration: path }, "bootstrap: schema ready (sentinel)");
  } catch (err) {
    logger.error({ err }, "bootstrap: failed to apply migration");
    throw err;
  } finally {
    // Best-effort unlock; the lock dies with the connection anyway,
    // so we don't let a failed unlock mask the real bootstrap result.
    await db
      .execute(sql`SELECT pg_advisory_unlock(${BOOTSTRAP_LOCK_KEY}::bigint)`)
      .catch((err) => logger.warn({ err }, "bootstrap: advisory unlock failed"));
  }
}
