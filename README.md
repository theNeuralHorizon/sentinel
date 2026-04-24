<h1 align="center">Sentinel</h1>

<p align="center">
  <strong>AI-native software supply chain security with autonomous remediation.</strong><br/>
  Scan, reason, decide, dispatch &mdash; in one governed pipeline.
</p>

<p align="center">
  <a href="https://github.com/theNeuralHorizon/sentinel/actions/workflows/ci.yml"><img src="https://github.com/theNeuralHorizon/sentinel/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/theNeuralHorizon/sentinel/actions/workflows/security.yml"><img src="https://github.com/theNeuralHorizon/sentinel/actions/workflows/security.yml/badge.svg" alt="Security"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/tests-55%20bun%20%2B%208%20go-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/runtime-Bun%201.3-yellow?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/ui-SvelteKit%205-FF3E00?logo=svelte&logoColor=white" alt="SvelteKit">
  <img src="https://img.shields.io/badge/SBOM-CycloneDX%201.6%20%7C%20SPDX%203.0-blue" alt="SBOM">
  <img src="https://img.shields.io/badge/vectors-pgvector%20HNSW-336791?logo=postgresql&logoColor=white" alt="pgvector">
  <img src="https://img.shields.io/badge/AI-Claude%20Opus%204.7-8A2BE2" alt="Claude">
</p>

---

## Table of contents

- [Why Sentinel](#why-sentinel)
- [What Sentinel does](#what-sentinel-does)
- [System architecture](#system-architecture)
- [How a scan flows end-to-end](#how-a-scan-flows-end-to-end)
- [AI risk enrichment pipeline](#ai-risk-enrichment-pipeline)
- [Remediation approval lifecycle](#remediation-approval-lifecycle)
- [Data model](#data-model)
- [Tech stack](#tech-stack)
- [Feature matrix](#feature-matrix)
- [Quickstart (5 minutes)](#quickstart-5-minutes)
- [Testing & verification](#testing--verification)
- [Deploying to production](#deploying-to-production)
- [Repo layout](#repo-layout)
- [Development](#development)
- [Roadmap & status](#roadmap--status)
- [Documentation index](#documentation-index)
- [License & sources](#license--sources)

---

## Why Sentinel

| Pain in 2026 | Concrete evidence | Sentinel's answer |
|---|---|---|
| Enterprises can't see their AI/ML supply chain | [62% of security teams have no visibility into where LLMs run](https://venturebeat.com/security/seven-steps-to-ai-supply-chain-visibility) | First-class detectors for HuggingFace models, datasets, MCP servers; ML-BOM in CycloneDX 1.6 |
| Regulation is no longer optional | [EU Cyber Resilience Act (2027) + US EO 14028 / EO 14144](https://www.perforce.com/blog/alm/executive-order-14028-compliance) | Signed SBOMs + attestations in CI; auditable policy engine |
| CVE tools flood teams with low-signal alerts | Thousands of findings → no business context | LLM-powered re-ranking (CVSS × EPSS × license × reachability × fix availability) |
| License compliance across transitive deps is manual | [Sonatype 2026 State of Supply Chain](https://www.sonatype.com/state-of-the-software-supply-chain/2026/software-compliance) | Classifier + 20-license matrix + declarative policies (`block AGPL`, `escalate SSPL`, …) |
| Remediation is glue code nobody wants to own | Every team writes its own PR/Jira/Slack bot | Agentic dispatch through n8n — **500+ prebuilt integrations** |

---

## What Sentinel does

1. **Multi-ecosystem scanning** &mdash; npm, PyPI, Go modules, Cargo, Maven, containers, HuggingFace models, datasets, **and MCP servers** (CycloneDX 1.6 + SPDX 3.0 AI profile).
2. **Business-aware risk scoring** &mdash; Claude Opus 4.7 reasons over CVSS, EPSS, license risk, transitive flags and fix availability, with a deterministic fallback so the system works offline.
3. **Vector-indexed provenance** &mdash; pgvector HNSW answers *"what else is affected by something like log4shell?"* in milliseconds.
4. **Agentic remediation** &mdash; n8n workflows open PRs, file tickets, rotate tokens, or page on-call based on the risk class and your policies.
5. **Natural-language queries** &mdash; *"what's my exposure to CVE-2024-xxxx?"* &rarr; instant answer grounded in your live SBOM graph.
6. **Drift monitoring** &mdash; every release emits a signed SBOM; Sentinel diffs them so regressions surface before they hit production.

---

## System architecture

```mermaid
flowchart TB
  classDef edge    fill:#0b1220,stroke:#6aa2ff,color:#e8f0ff
  classDef api     fill:#0d1628,stroke:#aee571,color:#eafbd6
  classDef worker  fill:#1a0f24,stroke:#c86bff,color:#f3e6ff
  classDef data    fill:#0a1a14,stroke:#26d07c,color:#d2f3e1
  classDef ai      fill:#1b0d0d,stroke:#ff7676,color:#ffe0e0
  classDef auto    fill:#121a0c,stroke:#ffa726,color:#ffe9c7

  subgraph CLIENTS["👤  Clients"]
    WEB["SvelteKit 5 Dashboard<br/>:5173"]:::edge
    CLI["sentinel-cli"]:::edge
    CI["CI / CD Pipelines"]:::edge
  end

  subgraph GATEWAY["🌐  API Gateway (Bun + Hono)"]
    API["REST + WebSocket<br/>:4000"]:::api
    AUTH["JWT auth + RBAC"]:::api
    RATE["Rate limit<br/>(Dragonfly)"]:::api
  end

  subgraph WORKERS["⚙️  Workers"]
    SCAN["Go Scanner<br/>:4100"]:::worker
    ANLZ["Bun Analyzer<br/>:4200"]:::worker
  end

  subgraph DATA["💾  Data plane"]
    PG[("Postgres 17<br/>+ pgvector")]:::data
    DF[("Dragonfly<br/>cache / RL")]:::data
    NATS[("NATS JetStream<br/>events")]:::data
    S3[("MinIO<br/>artifacts")]:::data
  end

  subgraph AI["🧠  AI & embeddings"]
    CLAUDE["Claude Opus 4.7"]:::ai
    EMB["Embeddings<br/>(Voyage / hash)"]:::ai
  end

  subgraph AUTO["🤖  Automation"]
    N8N["n8n<br/>:5679"]:::auto
    GH["GitHub / Jira / Slack / PagerDuty"]:::auto
  end

  WEB -- "HTTPS + WS" --> API
  CLI -- "HTTPS" --> API
  CI -- "HTTPS" --> API

  API --> AUTH --> RATE
  API -- "/v1/scan" --> SCAN
  API -- "publish" --> NATS
  API -- "SELECT / HNSW" --> PG
  API -- "rate counters" --> DF

  NATS -- "vuln.discovered" --> ANLZ
  ANLZ -- "prompt + JSON" --> CLAUDE
  ANLZ -- "embed()" --> EMB
  ANLZ -- "UPDATE ai_risk_score" --> PG
  ANLZ -- "INSERT proposed" --> PG

  SCAN -- "SBOM artifact" --> S3
  SCAN -- "CycloneDX 1.6" --> API

  API -- "webhook" --> N8N
  N8N --> GH
```

**What this shows.** Five stateless services behind one API gateway, three stateful data services, two optional AI providers, and one pluggable automation layer. Every box is horizontally scalable except the databases; every inter-service hop is observable (OpenTelemetry) and auditable (append-only `events` table).

---

## How a scan flows end-to-end

```mermaid
sequenceDiagram
  autonumber
  participant U as User<br/>(Dashboard / CLI / CI)
  participant A as API<br/>(Bun + Hono)
  participant DB as Postgres<br/>+ pgvector
  participant S as Scanner<br/>(Go)
  participant N as NATS<br/>JetStream
  participant W as Analyzer<br/>(Bun)
  participant C as Claude<br/>Opus 4.7
  participant NN as n8n

  U->>A: POST /v1/scans { projectSlug, workDir }
  A->>DB: INSERT scans {status=running, metadata.workDir}
  A->>N: publish sentinel.scan.requested
  A-->>U: 202 Accepted { scan.id }

  A->>S: POST /v1/scan { workDir }
  S->>S: walk tree · match detectors (npm · pypi · go · cargo · maven · ML-BOM · MCP)
  S->>S: resolve advisories (offline catalog / OSV)
  S->>S: emit CycloneDX 1.6 JSON
  S-->>A: { components[], vulnerabilities[], sbomContent }

  A->>A: embed every component (hash / Voyage)
  A->>DB: INSERT components · vulnerabilities · baseline ai_risk_score
  A->>N: publish sentinel.scan.completed
  N-->>U: WebSocket: scan.completed

  W->>DB: SELECT new vulnerabilities
  W->>C: analyze risk (system prompt cached)
  C-->>W: { ai_risk_score, exploitability, business_impact, reasoning }
  W->>DB: UPDATE vulnerability enrichment

  W->>C: propose remediation
  C-->>W: { kind, parameters, requires_approval }
  W->>DB: INSERT remediations {state=proposed}
  W->>N: publish sentinel.remediation.proposed

  U->>A: POST /v1/remediations/:id/approve
  A->>DB: UPDATE remediations {state=queued}
  A->>NN: POST /webhook/sentinel-<kind>
  NN-->>A: { executionId }
  A->>DB: UPDATE remediations {state=dispatched}
  NN->>NN: open PR / file issue / page on-call
```

---

## AI risk enrichment pipeline

Every vulnerability goes through a two-stage pipeline. The deterministic baseline always runs; the LLM stage is optional.

```mermaid
flowchart LR
  subgraph BASELINE["⚙️  Deterministic baseline (always on)"]
    direction TB
    CVSS[CVSS v3.1] --> FORMULA
    EPSS[EPSS probability] --> FORMULA
    LIC[License risk tier] --> FORMULA
    TR[Transitive flag] --> FORMULA
    FIX[Fix available?] --> FORMULA
    FORMULA["Weighted blend<br/>0.6·CVSS·10 + 0.4·severity<br/>× EPSS × license × fix"]
    FORMULA --> B0["baseline 0–100"]
  end

  subgraph LLM["🧠  LLM refinement (optional)"]
    direction TB
    VULN[Advisory + details]
    CTX[Component context]
    PRO[Project context]
    VULN --> PROMPT
    CTX  --> PROMPT
    PRO  --> PROMPT
    PROMPT["System prompt<br/>(prompt-cached)"]
    PROMPT --> CLAUDE[Claude Opus 4.7]
    CLAUDE --> ZOD["Zod-validated JSON<br/>{risk, exploitability,<br/>business_impact, reasoning}"]
  end

  B0 -.floor.-> DECIDE
  ZOD -.refine.-> DECIDE
  DECIDE["max(baseline, ai_score)<br/>(LLM can raise, never drop<br/>below the deterministic floor)"]
  DECIDE --> FINAL["ai_risk_score 0–100<br/>+ reasoning text<br/>+ exploitability class<br/>+ business_impact tier"]

  style DECIDE fill:#0d1628,stroke:#aee571,color:#eafbd6
  style FINAL  fill:#0a1a14,stroke:#26d07c,color:#d2f3e1
```

**Safety property.** The LLM can only raise the score, never drop it below the deterministic floor. A compromised or prompt-injected model cannot mark a critical CVE as low-risk ([docs/AI_SECURITY.md](docs/AI_SECURITY.md)).

---

## Remediation approval lifecycle

```mermaid
stateDiagram-v2
  [*] --> proposed : analyzer proposes kind+params
  proposed --> queued : human approves
  proposed --> suppressed : analyst overrides
  queued --> dispatched : POST n8n webhook OK
  queued --> failed : n8n/network error
  dispatched --> succeeded : n8n reports 2xx + outcome
  dispatched --> failed : n8n reports error
  dispatched --> rolled_back : human revokes
  failed --> proposed : retry after fix
  succeeded --> [*]
  suppressed --> [*]

  note right of proposed
    state chip in UI: brand green
    "Approve & dispatch" button
  end note
  note right of dispatched
    API records n8n executionId
    for audit + post-mortem
  end note
```

**Approval by default, autonomy by policy.** Every remediation starts in `proposed`; a human clicks Approve to advance. Policies can mark specific kinds (e.g. `notify_slack` for low-severity info) as auto-approved.

---

## Data model

```mermaid
erDiagram
  PROJECTS ||--o{ SCANS : "has"
  SCANS ||--o{ COMPONENTS : "discovered"
  SCANS ||--o{ VULNERABILITIES : "found"
  COMPONENTS ||--o{ VULNERABILITIES : "affects"
  VULNERABILITIES ||--o{ REMEDIATIONS : "proposes"
  POLICIES }o--o{ VULNERABILITIES : "evaluates"
  SCANS ||--o{ EVENTS : "emits"

  PROJECTS {
    uuid id PK
    text slug UK
    text name
    text repo_url
    text default_branch
    text[] tags
    jsonb metadata
    timestamptz created_at
  }

  SCANS {
    uuid id PK
    uuid project_id FK
    enum status
    enum kind
    int component_count
    int vuln_count
    int risk_score
    text sbom_s3_key
    jsonb metadata
    timestamptz started_at
    timestamptz completed_at
  }

  COMPONENTS {
    uuid id PK
    uuid scan_id FK
    enum ecosystem
    text name
    text version
    text purl UK
    text license
    enum license_risk
    boolean is_transitive
    vector embedding "HNSW index"
  }

  VULNERABILITIES {
    uuid id PK
    uuid component_id FK
    text advisory_id
    enum severity
    real cvss_score
    real epss_score
    int ai_risk_score
    text ai_reasoning
    enum state
    text[] fixed_versions
  }

  REMEDIATIONS {
    uuid id PK
    uuid vulnerability_id FK
    enum kind
    enum state
    jsonb parameters
    text workflow_id
    text execution_id
    timestamptz approved_at
  }

  POLICIES {
    uuid id PK
    text slug UK
    text name
    boolean enabled
    jsonb rules
    text[] tags
  }
```

Every arrow is a `FOREIGN KEY ... ON DELETE CASCADE`. Every `jsonb` field has a corresponding Zod schema in `packages/shared/src/`. pgvector's HNSW index on `components.embedding` keeps similarity queries sub-millisecond up to hundreds of millions of rows.

---

## Tech stack

### Runtime & language

| Layer | Tech | Version | Why |
|---|---|---|---|
| API runtime | **Bun** | 1.3 | ~3× Node's HTTP throughput · native TypeScript · zero build step · Hono on Bun does **130k+ req/s** |
| API framework | **Hono** | 4.12 | Edge-ready (also runs on Cloudflare Workers, Deno) · tiny core, strict TypeScript |
| Scanner | **Go** | 1.22 | Whole SBOM ecosystem is Go (syft, grype, osv-scanner, Trivy, cosign) · 10 MB static binary |
| Frontend | **SvelteKit 5** | 2.8 | Runes for fine-grained reactivity · adapter-node for Bun-served SSR |
| Styling | **Tailwind v4** | alpha | CSS-first `@theme` tokens · OKLCH colour space · no JS config file |

### Data plane

| Store | Tech | Why |
|---|---|---|
| Relational + vectors | **Postgres 17 + pgvector** | Transactional consistency between components and their embeddings; HNSW is fast enough for hundreds of millions of rows |
| Cache / rate limit | **Dragonfly** | 25× Redis throughput on the same wire protocol · snapshot-based persistence |
| Events | **NATS JetStream** | Lightweight at-least-once · cleanly audited per-subject · survives broker restarts |
| Object storage | **MinIO** | S3-compatible · optional but simplifies artifact capture (SBOM JSON, logs) |

### AI

| Component | Tech | Fallback |
|---|---|---|
| Risk reasoning | **Claude Opus 4.7** (Anthropic SDK) | `computeBaselineRisk` — deterministic weighted formula |
| Remediation planning | **Claude Opus 4.7** | Rule-based (`pr_bump` if fix exists, else `issue_ticket`) |
| NL query planning | **Claude Opus 4.7** | Regex router (`CVE-*` / `GHSA-*` / `"exposure to X"`) |
| Embeddings | **Voyage-3-large** (configurable) | **`hashToVector`** deterministic L2-normalised hash (works offline) |

> **Important.** Nothing is "trained" — Sentinel is a pure consumer of a hosted LLM. The deterministic fallbacks mean the whole platform runs fully offline with zero external dependencies. See [docs/AI_SECURITY.md](docs/AI_SECURITY.md) for OWASP-LLM Top-10 mapping.

### Type system & validation

| Concern | Library |
|---|---|
| ORM & migrations | **Drizzle ORM** — zero-overhead, type-safe, serverless-friendly |
| Schema validation | **Zod** — used everywhere data crosses a boundary |
| LLM output | Claude &rarr; `extractJson` &rarr; Zod parse (never blind-trusted) |

### Automation & delivery

| Concern | Tech |
|---|---|
| Workflow engine | **n8n** — 500+ integrations, self-hostable, visual editor for security team |
| Container | Multi-stage Dockerfiles (Bun-alpine / Go-alpine), non-root, read-only rootfs, dropped caps |
| Orchestration | Docker Compose for local · **Kubernetes** manifests + **Helm** chart for prod |
| CI | GitHub Actions — lint, typecheck, Bun tests, Go tests, Postgres integration, 4-image matrix build |
| Security CI | gitleaks · Trivy FS · OSV-Scanner · CodeQL (Go + TS) · Syft SBOM + `actions/attest-sbom` |
| Release | Signed multi-arch images, cosign provenance + SBOM attestation |

---

## Feature matrix

| Feature | Status | Where |
|---|---|---|
| npm / pypi / go / cargo / maven detectors | ✅ Shipping | `apps/scanner/internal/scan/detectors*.go` |
| HuggingFace model / dataset detector | ✅ Shipping | `detectors.go::mlModelDetector` |
| MCP server detector (`.mcp.json`) | ✅ Shipping | `detectors.go::mcpDetector` |
| CycloneDX 1.6 SBOM output | ✅ Shipping | `cyclonedx.go` |
| SPDX 3.0 output | 🟡 Roadmap v0.2 | — |
| Deterministic baseline risk | ✅ Shipping | `packages/shared/src/risk.ts` |
| Claude-refined risk score | ✅ Shipping | `packages/ai/src/risk.ts` |
| pgvector semantic search | ✅ Shipping | `apps/api/src/routes/search.ts` |
| Natural-language query planner | ✅ Shipping | `apps/api/src/routes/nl-query.ts` |
| Declarative policy engine | ✅ Shipping | `packages/shared/src/policy.ts` |
| Policy dry-run (`/v1/policy-eval`) | ✅ Shipping | `apps/api/src/routes/policy-eval.ts` |
| Full per-scan policy audit | ✅ Shipping | `policy-eval.ts::/scan` |
| n8n workflow dispatch | ✅ Shipping | `apps/api/src/services/n8n.ts` |
| Live WebSocket activity feed | ✅ Shipping | `apps/api/src/services/ws-hub.ts` |
| Drift diff (CLI + API) | ✅ Shipping | `apps/cli/src/commands/diff.ts` |
| `sentinel-cli scan / diff / export` | ✅ Shipping | `apps/cli/` |
| Helm chart + K8s manifests | ✅ Shipping | `infra/helm/` · `infra/k8s/` |
| OIDC / SAML SSO | 🟡 Roadmap v0.3 | — |
| Tenant-scoped RBAC + audit export | 🟡 Roadmap v0.3 | — |
| Live OSV mirror (replacing built-in catalog) | 🟡 Roadmap v0.2 | — |

✅ = shipping and in CI · 🟡 = planned · see [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Quickstart (5 minutes)

**Prerequisites:** Docker 24+, Bun 1.3, (optional) an Anthropic API key.

```bash
# 1. Clone and configure
git clone https://github.com/theNeuralHorizon/sentinel
cd sentinel
cp .env.example .env
# Optional: add ANTHROPIC_API_KEY=sk-ant-... to .env

# 2. Bring up the full stack (Postgres, Dragonfly, NATS, MinIO, n8n, scanner, analyzer, api, web, otel)
docker compose up -d

# 3. Apply the schema (first run only) + seed demo data
docker compose exec -T postgres psql -U sentinel -d sentinel \
  < packages/db/migrations/0000_init.sql
docker compose exec -T api bun run //app/scripts/seed.ts

# 4. Verify the whole stack end-to-end (18 live assertions)
bun run scripts/verify.ts

# 5. Open the dashboard
open http://localhost:5173
```

You should see a populated dashboard with 3 projects, 4 real CVEs, an AI supply chain card tracking models + MCP servers, and a pulsing live activity feed.

Full walkthrough: [docs/QUICKSTART.md](docs/QUICKSTART.md). Demo script: [docs/DEMO.md](docs/DEMO.md).

---

## Testing & verification

Sentinel ships three layers of verification. All three must pass before a PR can merge.

```mermaid
flowchart LR
  classDef unit fill:#0a1a14,stroke:#26d07c,color:#d2f3e1
  classDef int  fill:#0d1628,stroke:#aee571,color:#eafbd6
  classDef e2e  fill:#1b0d0d,stroke:#ff7676,color:#ffe0e0

  U1["Unit · 55 Bun tests<br/>bun test"]:::unit
  U2["Unit · 8 Go tests<br/>go test ./..."]:::unit
  U3["Typecheck · strict<br/>bun x tsc --noEmit"]:::unit
  I1["Integration · Postgres<br/>apply 0000_init.sql<br/>→ seed.ts"]:::int
  I2["Build matrix · 4 images<br/>docker buildx"]:::int
  E1["Live verifier · 18 assertions<br/>bun run scripts/verify.ts"]:::e2e

  U1 --> U3
  U2 --> I1
  U3 --> I1
  I1 --> I2
  I2 --> E1
```

### Unit + integration (local)

```bash
bun test                              # 55 Bun tests
cd apps/scanner && go test ./...      # 8 Go tests
(cd apps/api && bun x tsc --noEmit)   # strict typecheck
```

### Live end-to-end (against the running stack)

```bash
bun run scripts/verify.ts
```

Prints a coloured table of 18 assertions covering liveness, auth, data plane, risk engine, policy engine, pgvector similarity, NL query routing and scanner reachability. Exits non-zero on any failure — drop-in for deploy gates.

### CI (GitHub Actions)

- `ci.yml` — lint + typecheck + unit tests + integration (live Postgres service) + 4-image build matrix
- `security.yml` — gitleaks + Trivy FS + OSV-Scanner + CodeQL (Go + TS/JS) + SBOM attestation
- `release.yml` — on `v*.*.*` tags: build 4 images, push to GHCR with cosign provenance + SBOM, cut GitHub release with auto-generated notes

---

## Deploying to production

```mermaid
flowchart LR
  DEV["git tag v0.x.0"] --> RELEASE
  RELEASE["release.yml<br/>Buildx matrix"] --> GHCR[("ghcr.io/&lt;org&gt;/sentinel-*")]
  GHCR --> HELM
  HELM["helm install sentinel<br/>./infra/helm/sentinel"] --> K8S["Kubernetes"]
  K8S --> ING["Ingress<br/>(cert-manager)"]
  K8S --> HPA["HPA<br/>2–10 replicas · 70% CPU"]
  K8S --> PG["Postgres StatefulSet<br/>+ pgvector"]
  K8S --> NATSC["NATS StatefulSet"]
  K8S --> DFC["Dragonfly Deployment"]

  style GHCR fill:#0d1628,stroke:#aee571,color:#eafbd6
  style K8S  fill:#0a1a14,stroke:#26d07c,color:#d2f3e1
```

Every image ships with **cosign provenance + SBOM attestation**. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for air-gapped deploys, backup scripts, and the production hardening checklist.

---

## Repo layout

```
sentinel/
├── apps/
│   ├── api/          Bun + Hono gateway — REST + WebSocket, JWT auth, rate limit
│   ├── analyzer/     Bun worker — Claude-powered risk + remediation planner
│   ├── scanner/      Go service — multi-ecosystem SBOM generation
│   ├── cli/          Bun CLI — sentinel-cli scan | diff | export
│   └── web/          SvelteKit 5 + Tailwind v4 — live dashboard
├── packages/
│   ├── db/           Drizzle schema + migrations
│   ├── shared/       Zod schemas · risk formula · license matrix · purl
│   └── ai/           Claude SDK wrapper · prompts · embedders
├── infra/
│   ├── docker/       Dockerfiles · compose overrides · otel-collector config
│   ├── k8s/          Kustomize manifests (namespace, statefulset, deployment, ingress, HPA)
│   ├── helm/         Helm chart (Chart.yaml, values.yaml, templates/)
│   └── n8n/          Remediation workflow templates (pr-bump, issue-ticket, notify-slack, escalate-oncall)
├── .github/
│   └── workflows/    ci.yml · security.yml · release.yml + Dependabot
├── docs/             12 markdown docs (architecture, API, policies, deploy, AI-security, …)
├── scripts/          seed.ts · verify.ts · smoke.sh
├── docker-compose.yml
├── CLAUDE.md         Guidance for AI agents contributing
└── README.md
```

---

## Development

```bash
# Install everything (workspace-aware)
bun install

# Run each service in its own terminal
bun --cwd apps/api      dev    # API on :4000
bun --cwd apps/analyzer dev    # Analyzer on :4200
bun --cwd apps/web      dev    # Web on :5173
cd apps/scanner && go run ./cmd/scanner   # Go scanner on :4100
```

Preferred loop is **HMR on the web + Docker for everything else**: `docker compose up -d postgres dragonfly nats minio n8n otel-collector scanner analyzer api` then `bun --cwd apps/web dev` locally.

**Agent contributions:** see [CLAUDE.md](CLAUDE.md) for hard rules (don't bypass JWT, update all 4 enum locations together, etc.) and [CONTRIBUTING.md](CONTRIBUTING.md) for the human version.

---

## Roadmap & status

- **v0.1.x (now)** — everything above, shipping with 63 tests + full CI
- **v0.2** — syft library integration · Cargo/Maven/container scanners · live OSV mirror · Voyage-3 embedder · SPDX 3.0 export
- **v0.3** — OIDC/SAML · multi-tenant RBAC · audit log export (SIEM-ready) · Slack app with interactive approvals
- **v0.4** — confidence-gated auto-dispatch · outcome learning · drift budgets

Full detail in [docs/ROADMAP.md](docs/ROADMAP.md). Everything we deliberately chose **not** to build is listed there too.

---

## Documentation index

| Doc | What it covers |
|---|---|
| [QUICKSTART](docs/QUICKSTART.md) | 5-minute local bring-up |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Every service, every data flow, every design decision |
| [API](docs/API.md) | Full REST + WebSocket reference |
| [POLICIES](docs/POLICIES.md) | Authoring declarative governance rules |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Kubernetes, Helm, hardening, backups, air-gapped |
| [DEPLOY_VERCEL_RENDER](docs/DEPLOY_VERCEL_RENDER.md) | One-click public-cloud deploy via `render.yaml` + `vercel.json` |
| [AI_SECURITY](docs/AI_SECURITY.md) | OWASP LLM Top-10 coverage + threat model |
| [BENCHMARKS](docs/BENCHMARKS.md) | Numbers + reproduction commands |
| [FAQ](docs/FAQ.md) | Stack choices, ownership, compliance, performance |
| [RESEARCH](docs/RESEARCH.md) | The 2026 industry context driving this |
| [ROADMAP](docs/ROADMAP.md) | What's next, what's deliberately out of scope |
| [DEMO](docs/DEMO.md) | 10-minute buyer walkthrough script |
| [CLAUDE.md](CLAUDE.md) | Guidance for AI agents working on this repo |
| [CONTRIBUTING](CONTRIBUTING.md) | For human contributors |
| [SECURITY](SECURITY.md) | How to report vulnerabilities |
| [CHANGELOG](CHANGELOG.md) | Per-release notes |

---

## License & sources

**Apache-2.0.** See [LICENSE](LICENSE).

Grounded in the following 2026 industry work:

- Cloudsmith — [The 2026 Guide to Software Supply Chain Security: From Static SBOMs to Agentic Governance](https://cloudsmith.com/blog/the-2026-guide-to-software-supply-chain-security-from-static-sboms-to-agentic-governance)
- Sonatype — [2026 State of the Software Supply Chain](https://www.sonatype.com/state-of-the-software-supply-chain/2026/software-compliance)
- OpenSSF — [Software Supply Chain Security WG](https://openssf.org/tag/software-supply-chain-security/)
- Anchore — [Syft & Grype](https://anchore.com/opensource/)
- Netrise — [What EO 14028, EU CRA, and NIST CSF 2.0 Mean](https://www.netrise.io/xiot-security-blog/what-eo-14028-eu-cra-and-nist-csf-2.0-mean-for-software-supply-chain-transparency)
- VentureBeat — [Seven steps to AI supply chain visibility](https://venturebeat.com/security/seven-steps-to-ai-supply-chain-visibility)
- NIST — AI Risk Management Framework (AI-BOM / ML-BOM)

<p align="center"><sub>Built by <a href="https://github.com/theNeuralHorizon">theNeuralHorizon</a> · Powered by <a href="https://bun.sh">Bun</a>, <a href="https://svelte.dev">Svelte 5</a>, <a href="https://www.postgresql.org/">Postgres 17</a>, <a href="https://github.com/pgvector/pgvector">pgvector</a>, <a href="https://claude.ai">Claude Opus</a>, <a href="https://n8n.io">n8n</a>.</sub></p>
