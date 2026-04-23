#!/usr/bin/env bun
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationClient = postgres(url, { max: 1 });
const db = drizzle(migrationClient);

console.log("Running migrations...");
await migrate(db, { migrationsFolder: "./migrations" });
console.log("Migrations complete.");
await migrationClient.end();
