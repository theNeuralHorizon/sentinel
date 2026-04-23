import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

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
