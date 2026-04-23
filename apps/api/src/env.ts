import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_JWT_SECRET: z.string().min(32, "API_JWT_SECRET must be at least 32 chars"),
  API_JWT_EXPIRY: z.string().default("24h"),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NATS_URL: z.string().min(1),

  SCANNER_URL: z.string().url().default("http://localhost:4100"),
  ANALYZER_URL: z.string().url().default("http://localhost:4200"),

  N8N_URL: z.string().url().optional(),
  N8N_API_KEY: z.string().optional(),
  N8N_WEBHOOK_BASE: z.string().url().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-7"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
