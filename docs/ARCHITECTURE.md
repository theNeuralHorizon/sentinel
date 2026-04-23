# Architecture

Sentinel is a five-service system backed by three data services. Every service
is stateless except for the databases, so horizontal scaling is a `replicas:`
bump.

## Services

| Service | Lang | Port | Role |
|---|---|---|---|
| `api` | Bun + Hono + Drizzle | 4000 | REST + WebSocket gateway. Validates, authenticates, fans out work, serves the UI over its API. |
| `scanner` | Go | 4100 | Stateless SBOM generation. Detects manifests per ecosystem, emits normalised components + CycloneDX 1.6. |
| `analyzer` | Bun + Claude | 4200 | AI enrichment worker. Polls for new vulnerabilities, calls Claude for risk scoring + remediation proposals, writes back. |
| `web` | SvelteKit 5 + Tailwind v4 | 3000 | Dashboard. Real-time via WebSocket, Runes-based reactivity. |
| `cli` | Bun (compiled) | — | `sentinel-cli scan | diff | export`. Thin wrapper around the API. |

## Data plane

| Component | Purpose |
|---|---|
| Postgres 17 + pgvector | Relational store. `components.embedding` is a `vector(1024)` with an HNSW index for sub-ms cosine similarity. |
| Dragonfly | Redis-compatible. Rate limiter, optional cache. 25× throughput of vanilla Redis, drop-in protocol. |
| NATS JetStream | Event bus. Every state transition publishes to `sentinel.<domain>.<action>`. The API bridges these subjects onto the WebSocket hub. |
| MinIO | S3-compatible object store for raw SBOM artifacts. |
| n8n | Self-hostable automation engine. Each `remediation_kind` maps to a workflow named `sentinel-<kind>`. |

## Request flow

### A scan, end-to-end

1. `POST /v1/scans { projectSlug, workDir }` → API inserts `scans{status=running}`, publishes `sentinel.scan.requested`, returns `202 scan`.
2. API calls `scanner /v1/scan` with the workDir. Scanner walks the tree, runs every matching detector in the default set, produces a `Result` with components + vulnerabilities + CycloneDX 1.6 SBOM.
3. API embeds each component (hash-embedder by default, pluggable to Voyage / OpenAI / local) and inserts rows in one transaction, writing the HNSW vector alongside.
4. API computes a baseline risk per vulnerability using CVSS × EPSS × license risk × transitive multiplier, then updates the scan row with counters + `riskScore`.
5. API publishes `sentinel.scan.completed`. The WebSocket bridge forwards it to anyone subscribed to `project:<id>` or `global`.
6. The analyzer worker picks up the new vulnerabilities on its next tick (or immediately on NATS event). It asks Claude for:
   - an AI risk score, exploitability class, business impact, and short reasoning
   - a recommended remediation kind + parameters
7. For every proposal, a `remediations{state=proposed}` row is inserted. The analyzer fires `sentinel.remediation.proposed`. The UI shows a card with an **Approve & Dispatch** button.
8. When a human approves, the API sets `state=queued`, POSTs to `n8n /webhook/sentinel-<kind>`, receives the n8n `executionId`, and transitions to `dispatched`.
9. The n8n workflow does the real-world action: open a PR, file a ticket, post to Slack, page on-call. Its response rolls into `remediations.outcome`.

### Natural-language query

1. `POST /v1/search/similar { query }` → API embeds the query string using the same embedder.
2. pgvector HNSW `<=>` cosine-distance search against `components.embedding`.
3. Results are re-ranked by a secondary pass that blends similarity with current vulnerability counts.
4. UI renders the ranked list; click-through takes you to the scan that surfaced the component.

## Why this stack

- **Bun + Hono**: ~3× Node's HTTP throughput, native TS, zero compile step. Hono works identically on Bun, Deno, CF Workers, so the API ports to the edge without rewrites. ([byteiota](https://byteiota.com/bun-runtime-production-guide-2026-speed-vs-stability/), [Kanopy](https://kanopylabs.com/blog/hono-vs-express-vs-fastify))
- **Go for the scanner**: the entire SBOM ecosystem (syft, grype, osv-scanner) is Go. Single static binary, trivial to ship in a 10 MB image.
- **Drizzle**: serverless-friendly, no N+1 footguns in the generated SQL, Zod-like schemas.
- **Postgres + pgvector**: one engine, two jobs. We avoid a dedicated vector DB — pgvector's HNSW index is competitive up to hundreds of millions of rows, and transactions across relational + vector data are invaluable for this use case.
- **Dragonfly over Redis**: we're read-heavy on rate-limit counters and pub/sub. 25× per-core throughput at the same API.
- **NATS JetStream**: lighter than Kafka, stronger than Redis pub/sub, offers at-least-once with per-subject streams.
- **SvelteKit 5 + Tailwind v4**: Runes removed the remaining footguns from Svelte's reactivity model; Tailwind v4's CSS-first `@theme` kills the JS config hop.
- **n8n**: self-hostable automation is a must for air-gapped and regulated deployments. 500+ integrations out of the box.

## Security

- JWT-based API auth; dev token minter is disabled by default when `NODE_ENV=production`.
- Rate limiting is per-API-key per-route per-minute, keyed in Dragonfly.
- All container images run non-root with `readOnlyRootFilesystem` and dropped caps.
- CI runs gitleaks, Trivy, OSV-Scanner, CodeQL, and Syft on every push.
- Release images ship with provenance + SBOM attestations (SLSA ≥ level 3 target).

## Observability

- OpenTelemetry via the bundled collector; traces + metrics flow to whatever OTLP endpoint you point at. For local dev, the collector exposes Prometheus on 8889.
- `sentinel.*` NATS subjects are the authoritative audit log.
- Every service ships `/healthz` + `/readyz`.
