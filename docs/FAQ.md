# FAQ

## Is this another CVE scanner?

No. Sentinel is an *orchestration + governance* layer on top of the existing CVE/SBOM ecosystem. We embrace syft, grype, osv-scanner, Trivy — they're excellent. Sentinel adds:

- AI-enriched risk scores that take business context into account (not just CVSS)
- A policy engine your security architect can hand to legal
- An autonomous remediation pipeline that fires n8n workflows
- First-class AI/ML supply chain tracking (HuggingFace, datasets, MCP servers)

If you want the raw CVE list, use grype. If you want to answer *"what do I do about these 4,000 findings?"*, use Sentinel.

## Why Bun over Node?

- 3× Node's HTTP throughput out of the box (130k req/s on a single core with Hono)
- Native TypeScript — zero build step in dev, zero build step in prod
- Drop-in Node compatibility for the 95% of our deps that don't use C++ addons
- Faster cold-start matters for the API, which runs as an HPA-scaled Deployment

The tradeoff: Bun is younger. We mitigate with `bun.lock` (text format), frozen installs in CI, and pinned `oven/bun:1.3-alpine` images.

## Why Go for the scanner but TS everywhere else?

The entire SBOM ecosystem is Go. Syft, grype, osv-scanner, Trivy, cosign — all Go. When we eventually swap our hand-rolled detectors for syft's library, it drops into the scanner binary with one `go get`. A TypeScript scanner would require porting those libraries.

The scanner is also the only service that benefits from a single static binary (~10 MB image), which matters for edge and air-gapped deployments.

## Do I need an Anthropic API key?

No. Sentinel ships with deterministic fallbacks for every AI call:

- Risk scoring falls back to a weighted blend of CVSS, EPSS, license risk, transitive flag, and fix availability
- Remediation planner falls back to a rule-based `pr_bump` / `issue_ticket` selection
- Natural-language query planner falls back to regex (CVE/GHSA match, "exposure to X")

Set `ANTHROPIC_API_KEY` when you want nuanced reasoning (e.g. "is this critical CVE reachable in our code path?").

## Why pgvector and not a dedicated vector DB?

- Transactional consistency between components and their embeddings
- One less service to operate
- HNSW in pgvector is fast enough for hundreds of millions of rows
- Same Drizzle schema handles relational + vector queries

Swap in Qdrant / Pinecone / Weaviate if you have >500M components — we'd love the PR.

## Why Dragonfly instead of Redis?

25× per-core throughput at the same wire protocol, saner memory management, snapshot-based persistence. If you already run Redis, keep running Redis — `REDIS_URL` works identically. Dragonfly is just the safer default for new deployments.

## Why n8n instead of Temporal or Airflow?

- **n8n is the right altitude**: we don't need a workflow engine, we need automation glue. n8n has 500+ prebuilt integrations (GitHub, Jira, Slack, Zendesk, PagerDuty, AWS, GCP...).
- **Self-hostable by default**, matters for regulated deployments
- **Visual editor for the security team**, they don't need to learn a DSL
- Sentinel is responsible for deciding *what* to do; n8n is responsible for *how* to talk to your stack

Temporal is overkill here — we don't have long-running multi-step sagas. Airflow is for data pipelines, not automation.

## Can I run this air-gapped?

Yes. See [DEPLOYMENT.md §Offline / air-gapped](./DEPLOYMENT.md#offline--air-gapped-deployments). Short version:

- Mirror four images to your internal registry
- Unset `ANTHROPIC_API_KEY`
- Point the OSV source at an internal mirror

## How does the AI-BOM / ML-BOM support work?

Two paths:

1. **Declarative manifest**: add a `sentinel-ai.json` to your project listing models and datasets. The scanner emits them as CycloneDX 1.6 `machine-learning-model` components.
2. **MCP servers**: we parse `.mcp.json` / `mcp.config.json` from any MCP-aware tool (Cursor, Claude Desktop, ECC, …) and track MCP servers as first-class supply chain components.

See the seeded demo — it includes a `codellama/CodeLlama-7b` model and a `weather` MCP server with a real advisory.

## Is this compliance-ready for CRA / EO 14028?

The building blocks are there:
- CycloneDX 1.6 SBOMs (CRA requirement)
- Vulnerability attestations (EO 14028 requirement)
- Cosign-signed images with SBOM attestations in CI
- Policy-evaluation audit log (queryable after the fact)

Full attestation bundling is on the v0.3 roadmap. Talk to us if you're shipping to the EU and need it sooner.

## Who owns the data?

You do. Sentinel is self-hosted. Nothing leaves your cluster unless you configure an outbound integration (Claude, n8n webhooks, OTel exporter). All three are optional.

## How fast does it scan?

For a typical mid-sized service (≈500 components across npm + PyPI + Go + 1 Docker image):
- Scanner: 2–5 seconds
- Embedding generation: <100ms with the hash embedder, 1–2s with Voyage-3
- AI enrichment: 5–30s per vuln with Claude Opus (batched)
- End-to-end dashboard update: under a minute for a small scan, a few minutes for a mono-repo

## Why Apache 2.0?

Maximises adoption. We care about being the *default* supply chain governance layer more than about extracting licence rent. If you want to embed Sentinel in a commercial product, go for it.

## How do I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md). The best first PRs are new ecosystem detectors — each one is ~150 lines of Go plus a test. `/infra/n8n/workflows` also welcomes new playbook templates.
