import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  unique,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { scans } from "./scans";
import { projects } from "./projects";

// pgvector custom column type.
// Dimensions match ANTHROPIC_EMBEDDING_MODEL (voyage-3-large = 1024).
export const vector = (name: string, dimensions = 1024) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value) {
      return `[${value.join(",")}]`;
    },
    fromDriver(value) {
      return JSON.parse(value as string) as number[];
    },
  })(name);

export const ecosystemEnum = pgEnum("ecosystem", [
  "npm",
  "pypi",
  "cargo",
  "gomodules",
  "maven",
  "nuget",
  "rubygems",
  "composer",
  "container",
  "ml_model",
  "dataset",
  "mcp_server",
  "other",
]);

export const components = pgTable(
  "components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => scans.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    ecosystem: ecosystemEnum("ecosystem").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    purl: text("purl").notNull(),
    cpe: text("cpe"),
    supplier: text("supplier"),
    sourceUrl: text("source_url"),

    license: text("license"),
    licenseConfidence: text("license_confidence"),
    licenseRisk: text("license_risk"),
    isTransitive: boolean("is_transitive").default(false).notNull(),
    directDependents: text("direct_dependents").array().default(sql`'{}'::text[]`).notNull(),

    hashSha256: text("hash_sha256"),
    signature: jsonb("signature").default(sql`'{}'::jsonb`).notNull(),

    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    embedding: vector("embedding", 1024),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("components_scan_idx").on(t.scanId),
    index("components_project_idx").on(t.projectId),
    index("components_purl_idx").on(t.purl),
    index("components_name_ver_idx").on(t.name, t.version),
    unique("components_scan_purl_unique").on(t.scanId, t.purl),
    // HNSW index on embedding for fast similarity search.
    index("components_embedding_idx")
      .using("hnsw", sql`embedding vector_cosine_ops`)
      .with({ m: 16, ef_construction: 64 }),
  ],
);

export type Component = typeof components.$inferSelect;
export type NewComponent = typeof components.$inferInsert;
