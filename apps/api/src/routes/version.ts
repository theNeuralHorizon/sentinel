import { Hono } from "hono";

// Runtime version + feature surface. Used by operators to confirm which build
// is deployed and whether optional integrations are wired up. All fields are
// safe to expose publicly (no secrets). The GIT_SHA is injected at image build
// time; NODE_ENV comes from the runtime.

export function createVersionRoute() {
  const route = new Hono();
  const sha = process.env.GIT_SHA ?? "dev";
  const version = process.env.npm_package_version ?? "0.1.0";
  const startedAt = new Date().toISOString();
  const build = process.env.BUILD_TIMESTAMP ?? startedAt;

  route.get("/", (c) =>
    c.json({
      service: "sentinel-api",
      version,
      commit: sha,
      buildTimestamp: build,
      startedAt,
      features: {
        llm: Boolean(process.env.ANTHROPIC_API_KEY),
        n8n: Boolean(process.env.N8N_URL),
        scanner: Boolean(process.env.SCANNER_URL),
        analyzer: Boolean(process.env.ANALYZER_URL),
        observability: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
      },
    }),
  );

  return route;
}
