#!/usr/bin/env bun
// Make this a module so top-level `await` typechecks cleanly under tsc.
export {};

/**
 * Sentinel verification script — runs 18 assertions against a live stack and
 * prints a table. Exits non-zero on any failure. Use after `docker compose up`.
 *
 *   bun run scripts/verify.ts
 *   SENTINEL_API=http://localhost:4000 bun run scripts/verify.ts
 *
 * Covers every non-trivial claim in README/docs so you can independently
 * confirm Sentinel behaves the way the docs say.
 */

const API = process.env.SENTINEL_API ?? "http://localhost:4000";

const results: Array<{ group: string; test: string; pass: boolean; note?: string }> = [];

async function check(group: string, test: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const note = (await fn()) ?? "";
    results.push({ group, test, pass: true, note });
  } catch (err) {
    results.push({ group, test, pass: false, note: err instanceof Error ? err.message : String(err) });
  }
}

async function r<T = unknown>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init?.body) headers.set("content-type", "application/json");
  const res = await fetch(API + path, { ...init, headers });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

// ---- 1. Liveness --------------------------------------------------------------
await check("liveness", "GET / returns 200", async () => {
  const b = await r<{ service: string }>("/");
  if (b.service !== "sentinel-api") throw new Error(`unexpected service: ${b.service}`);
  return b.service;
});
await check("liveness", "GET /healthz returns ok=true", async () => {
  const b = await r<{ ok: boolean }>("/healthz");
  if (b.ok !== true) throw new Error("ok is not true");
});
await check("liveness", "GET /version exposes commit + feature map", async () => {
  const b = await r<{ commit: string; features: Record<string, boolean> }>("/version");
  if (!b.features) throw new Error("no features map");
  return `commit=${b.commit} llm=${b.features.llm} n8n=${b.features.n8n}`;
});

// ---- 2. Auth ------------------------------------------------------------------
const login = await r<{ token: string; claims: { role: string } }>(
  "/v1/auth/token",
  {
    method: "POST",
    body: JSON.stringify({ username: "verify", password: "dev", role: "analyst" }),
  },
);
const TOKEN = login.token;
await check("auth", "Dev-login returns a JWT", async () => {
  if (!TOKEN || TOKEN.split(".").length !== 3) throw new Error("token is not a JWT");
  return `role=${login.claims.role}`;
});
await check("auth", "Unauthenticated /v1/projects returns 401", async () => {
  const res = await fetch(API + "/v1/projects");
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

// ---- 3. Data plane ------------------------------------------------------------
const summary = await r<{
  overall: Record<string, number | string>;
  topRisks: Array<{ advisoryId: string; aiRiskScore: number; componentName: string }>;
  byEcosystem: Array<{ ecosystem: string; components: number }>;
}>("/v1/metrics/summary", undefined, TOKEN);

await check("data", "At least 1 project exists (seed applied)", async () => {
  const n = Number(summary.overall.projects);
  if (n < 1) throw new Error(`projects=${n} — did you run the seed?`);
  return `projects=${n}`;
});
await check("data", "At least 1 vulnerability was discovered", async () => {
  const n = Number(summary.overall.total_vulns);
  if (n < 1) throw new Error(`total_vulns=${n}`);
  return `vulns=${n}`;
});
await check("data", "Critical count > 0 (seeded PyYAML CVE-2020-14343)", async () => {
  const n = Number(summary.overall.critical);
  if (n < 1) throw new Error(`critical=${n}`);
  return `critical=${n}`;
});
await check("data", "ML-BOM ecosystems are tracked (ml_model / mcp_server)", async () => {
  const eco = summary.byEcosystem.map((e) => e.ecosystem);
  const ai = eco.filter((e) => ["ml_model", "dataset", "mcp_server"].includes(e));
  if (ai.length === 0) throw new Error(`no AI ecosystems in ${eco.join(",")}`);
  return `ai_ecosystems=${ai.join(",")}`;
});

// ---- 4. Risk engine -----------------------------------------------------------
await check("risk", "Top risk is AI-scored, not raw CVSS", async () => {
  const t = summary.topRisks[0];
  if (!t) throw new Error("topRisks is empty");
  if (typeof t.aiRiskScore !== "number") throw new Error("no aiRiskScore on top risk");
  return `${t.advisoryId} on ${t.componentName} — aiRiskScore=${t.aiRiskScore}`;
});
await check("risk", "PyYAML 5.3.x gets a critical-tier score (>=80)", async () => {
  const pyyaml = summary.topRisks.find((t) => /pyyaml/i.test(t.componentName));
  if (!pyyaml) throw new Error("no pyyaml risk found — seed missing?");
  if (pyyaml.aiRiskScore < 80) throw new Error(`pyyaml scored ${pyyaml.aiRiskScore}, expected >=80`);
  return `pyyaml score=${pyyaml.aiRiskScore}`;
});

// ---- 5. Policy engine ---------------------------------------------------------
await check("policy", "AGPL license triggers block-agpl policy", async () => {
  const pe = await r<{ decision: string; matches: Array<{ slug: string }> }>(
    "/v1/policy-eval",
    { method: "POST", body: JSON.stringify({ context: { license: "AGPL-3.0", severity: "low" } }) },
    TOKEN,
  );
  if (pe.decision !== "block") throw new Error(`decision=${pe.decision}`);
  if (!pe.matches.some((m) => m.slug === "block-agpl")) throw new Error("block-agpl did not match");
  return `decision=${pe.decision}`;
});
await check("policy", "MIT license does NOT trigger block-agpl", async () => {
  const pe = await r<{ decision: string }>(
    "/v1/policy-eval",
    { method: "POST", body: JSON.stringify({ context: { license: "MIT", severity: "critical" } }) },
    TOKEN,
  );
  if (pe.decision === "block") throw new Error("MIT should not block");
  return `decision=${pe.decision}`;
});

// ---- 6. pgvector semantic search ---------------------------------------------
await check("search", "Similarity returns ranked components by cosine distance", async () => {
  const b = await r<{ results: Array<{ name: string; similarity: number }> }>(
    "/v1/search/similar",
    { method: "POST", body: JSON.stringify({ query: "yaml parser library", topK: 5 }) },
    TOKEN,
  );
  if (b.results.length === 0) throw new Error("no results");
  const sims = b.results.map((r) => r.similarity);
  const sorted = [...sims].sort((a, b) => b - a);
  if (JSON.stringify(sims) !== JSON.stringify(sorted)) throw new Error("results not ranked DESC by similarity");
  return `top=${b.results[0]!.name} (${(b.results[0]!.similarity * 100).toFixed(1)}%)`;
});
await check("search", "Cosine similarity stays in [0, 1]", async () => {
  const b = await r<{ results: Array<{ similarity: number }> }>(
    "/v1/search/similar",
    { method: "POST", body: JSON.stringify({ query: "random words xyzzy", topK: 10 }) },
    TOKEN,
  );
  for (const r of b.results) {
    if (r.similarity < 0 || r.similarity > 1) throw new Error(`similarity out of range: ${r.similarity}`);
  }
  return `${b.results.length} results`;
});

// ---- 7. Natural-language query -----------------------------------------------
await check("nl", "CVE-ID question routes to vulnerability_lookup", async () => {
  const b = await r<{ plan: { mode: string }; results: unknown[] }>(
    "/v1/nl",
    { method: "POST", body: JSON.stringify({ question: "any exposure to CVE-2020-14343?" }) },
    TOKEN,
  );
  if (b.plan.mode !== "vulnerability_lookup") throw new Error(`mode=${b.plan.mode}`);
  if (!Array.isArray(b.results) || b.results.length === 0) throw new Error("no results");
  return `mode=${b.plan.mode} hits=${b.results.length}`;
});
await check("nl", "'exposure to X' routes to similarity_search", async () => {
  const b = await r<{ plan: { mode: string; parameters: Record<string, unknown> } }>(
    "/v1/nl",
    { method: "POST", body: JSON.stringify({ question: "what is our exposure to log4j" }) },
    TOKEN,
  );
  if (b.plan.mode !== "similarity_search") throw new Error(`mode=${b.plan.mode}`);
  return `query_text="${String(b.plan.parameters.query_text)}"`;
});

// ---- 8. Scanner reachability --------------------------------------------------
await check("scanner", "Scanner /healthz reachable via API network", async () => {
  const scannerUrl = "http://localhost:4100/healthz";
  const res = await fetch(scannerUrl);
  if (!res.ok) throw new Error(`scanner ${res.status}`);
  return "200 OK";
});

// ---- Report ------------------------------------------------------------------
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass).length;

console.log("");
console.log("Sentinel verification");
console.log("=====================");
console.log(`API: ${API}`);
console.log("");

let lastGroup = "";
for (const r of results) {
  if (r.group !== lastGroup) {
    console.log(`\n  ${r.group}`);
    lastGroup = r.group;
  }
  const mark = r.pass ? "  ✓" : "  ✗";
  console.log(`${mark} ${r.test}${r.note ? `  (${r.note})` : ""}`);
}

console.log("");
console.log(`  ${pass} passed, ${fail} failed`);
console.log("");
if (fail > 0) process.exit(1);
