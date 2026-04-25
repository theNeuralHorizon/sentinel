import { z } from "zod";

// Known-insecure values that must NEVER appear in a production process.
// We refuse to start if NODE_ENV=production and any of these land in the env.
const INSECURE_JWT_SECRETS = new Set([
  "change-me-in-prod-min-32-chars-abcdef",
  "dev-secret-change-me-in-prod-1234567890",
]);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_JWT_SECRET: z.string().min(32, "API_JWT_SECRET must be at least 32 chars"),
  API_JWT_EXPIRY: z.string().default("24h"),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),

  // Comma-separated list of origins allowed by CORS. When empty, the API
  // locks down to none (prod-safe default). Set explicitly in prod to the
  // Vercel domain + any custom hosts.
  ALLOWED_ORIGINS: z.string().default(""),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  // NATS is optional in production — the WS bridge degrades gracefully when
  // the URL is blank (see services/events.ts).
  NATS_URL: z.string().default(""),

  SCANNER_URL: z.string().url().default("http://localhost:4100"),
  ANALYZER_URL: z.string().url().default("http://localhost:4200"),

  N8N_URL: z.string().url().optional(),
  N8N_API_KEY: z.string().optional(),
  N8N_WEBHOOK_BASE: z.string().url().optional(),

  // LLM provider selection. Auto-picks based on which key is present;
  // override here to force one explicitly (or "none" to skip the LLM).
  LLM_PROVIDER: z.enum(["anthropic", "gemini", "none", ""]).default(""),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-7"),

  // Google Gemini (free tier). https://aistudio.google.com/apikey
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL: z.string().default("gemini-2.0-flash"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  const env = parsed.data;

  // Hard production checks. Refuse to boot with known-insecure defaults.
  if (env.NODE_ENV === "production") {
    if (INSECURE_JWT_SECRETS.has(env.API_JWT_SECRET)) {
      console.error(
        "refusing to start: API_JWT_SECRET is a known demo value. " +
          "Generate one with: openssl rand -hex 32",
      );
      process.exit(1);
    }
    if (env.ALLOWED_ORIGINS.trim() === "") {
      console.error(
        "refusing to start: ALLOWED_ORIGINS must be set in production " +
          "(comma-separated list of https://... origins)",
      );
      process.exit(1);
    }
  }

  return env;
}

/** Parse ALLOWED_ORIGINS into a concrete list the Hono cors middleware accepts. */
export function parseAllowedOrigins(raw: string, nodeEnv: string): string[] {
  if (raw.trim() !== "") {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  // Dev-only default: everything a local developer might use.
  if (nodeEnv !== "production") {
    return [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ];
  }
  return [];
}
