import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/**
 * Decide whether the connection should require SSL.
 *
 * Managed Postgres providers (Render, Neon, Supabase, AWS RDS) refuse
 * unencrypted connections — postgres-js defaults to off, so we have to
 * opt in. We turn SSL ON unless the URL explicitly asks for
 * `sslmode=disable` or the host is localhost / a docker-compose
 * service name. Keeps `bun test` against a local pg instance flag-free.
 */
function resolveSslOption(url: string): "require" | false {
  try {
    const u = new URL(url);
    if (u.searchParams.get("sslmode") === "disable") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "postgres") {
      return false;
    }
    return "require";
  } catch {
    // Unparseable URL — let the server decide.
    return "require";
  }
}

export function createDb(connectionUrl?: string) {
  const url = connectionUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 20),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: resolveSslOption(url),
  });

  return drizzle(client, { schema });
}

// Singleton for apps that want a single shared pool.
let _db: Database | undefined;
export function db(): Database {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export { schema };
