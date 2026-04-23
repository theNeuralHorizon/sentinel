# 10-minute Demo Script

This is the script we use to demo Sentinel to a buyer or engineering lead. It works against the seeded database so it's always reproducible.

## Pre-flight (off-camera)

```bash
cp .env.example .env
docker compose up -d
docker compose exec -T postgres psql -U sentinel -d sentinel < packages/db/migrations/0000_init.sql
bun run scripts/seed.ts
```

Open `http://localhost:5173` in a maximised window.

## 0:00 — The problem

> "Every compliance leader we talk to says the same thing: 'we know we need SBOMs, we don't know what to do with them, and we have no idea where our AI surface area actually lives.' The EU Cyber Resilience Act is 12 months away. GitHub gives you the CVE list. Nobody gives you *what matters, and what to do about it.*"

## 0:45 — The overview screen

Show the dashboard. Point out:

- **4 stat cards** — projects, scans, components, vulnerabilities
- **Risk meter** — aggregate project risk, peak-weighted
- **Severity distribution** — open vulns across the whole org
- **Top risks** — sorted by AI risk score (not CVSS)
- **Live activity feed** — WebSocket-powered, updates every scan
- **By ecosystem** — notice `ml_model` and `mcp_server` are first-class alongside `npm`

> "Tailwind v4, SvelteKit 5 with Runes — the frontend is as new-gen as the backend. That glow around the activity feed is a CSS-only scanline."

## 1:30 — Trigger a real scan

Click **Projects** → **Trigger scan** → `payments-api` → `/workspace`. Click Scan.

Switch to the activity feed. Within 2-3 seconds:

- `scan started`
- `scan completed — 7 components, 4 vulns`

> "The API queued the scan, called the Go scanner service over HTTP, emitted a CycloneDX 1.6 SBOM, indexed every component's embedding into pgvector, and published a NATS event that the analyzer worker picks up."

## 2:30 — The vulnerability view

Click **Vulnerabilities**. Sort by AI risk.

> "Notice the AI risk column is NOT the same as CVSS. This pyyaml CVE has CVSS 9.8. This x/net CVE has CVSS 7.5. In a naive tool, pyyaml goes first. Here, Sentinel factors in EPSS — exploitation likelihood in the next 30 days — plus whether a fix exists, whether the component is transitive, and the component's popularity. pyyaml 5.3 still wins, but the justification is transparent."

Click a row. Show the `aiReasoning` field: "pyyaml 5.3 is widely deployed, the exploit is in the wild via EPSS 0.67, and a straightforward bump to 6.0 fixes it. Recommend auto-PR."

## 3:45 — Semantic search

Click **NL Query**. Type: *"anything like log4j for javascript"*. Hit search.

> "This is pgvector under the hood. We embed every component at scan time using a hash-based fallback embedder in dev, Voyage-3-large in production. HNSW index gives sub-millisecond cosine similarity. Results rank by component similarity, and you can filter by ecosystem."

## 4:30 — Policies

Click **Policies**. Show the three seeded policies.

> "These are declarative JSON. The rules engine has ten operators — eq, in, matches, etc. Each policy has an action: warn, block, escalate, remediate, notify. Customers write their own; this is the language their legal team already speaks."

Open `block-agpl`. Point out: *"This is what my legal team has been asking for for two years."*

## 5:30 — Remediations (the money slide)

Click **Remediations**.

> "When the analyzer finds a risk high enough to act on, it asks Claude Opus 4.7: 'Given this vuln, this component, and the channels we have available — what should we do?' Claude responds with a structured JSON: one of eight remediation kinds, a set of parameters, a short reasoning. That proposal goes here, waiting for human approval."

Click **Approve & Dispatch** on the lodash pr_bump.

> "That just fired a webhook at n8n. n8n is handling the boring part — cloning the repo, bumping the version, opening a PR, tagging the security channel. We don't write that glue, we let n8n own it. Every team has different integrations — Sentinel gives the brain, n8n gives the hands."

Optional: switch to `http://localhost:5678` and show the workflow run in n8n.

## 7:00 — The architecture (1-slide)

Open `docs/ARCHITECTURE.md` and show the ASCII diagram.

> "Five services, three data services. Bun + Hono for the API — three times Node's HTTP throughput. Go for the scanner because the entire SBOM ecosystem is Go. SvelteKit 5 + Tailwind v4 for the UI. Postgres 17 with pgvector does relational + vectors in one engine so we get transactional consistency between components and their embeddings. Dragonfly replaces Redis at 25× throughput, same API. NATS JetStream is the event bus. n8n is the automation layer. OpenTelemetry across the board."

## 8:00 — Deployment story

Open `infra/helm/sentinel/values.yaml`.

> "`helm install sentinel ./sentinel` and you're in production. HPA on the API, StatefulSet for Postgres + NATS, read-only root filesystem and non-root users on every container, ingress with cert-manager annotations. All images are signed with cosign in CI and carry SBOM attestations — we eat our own food."

## 8:45 — Why this wins

- **The only governance-first SBOM tool** — others are CVE scanners with dashboards
- **AI/ML supply chain is first class** — CycloneDX 1.6 ML-BOM + custom detectors for HuggingFace, datasets, MCP servers
- **Agentic remediation via n8n** — customers keep their existing integrations
- **Built on open standards** — CycloneDX, SPDX, OSV, pgvector. No lock-in
- **Compliance-ready** — SLSA + SBOM attestations out of the box for CRA and EO 14028

## 9:30 — Pricing (if asked)

> "Free for open source and single-project. Seat-based for teams — $39/user/month. Enterprise: $50k/year flat for unlimited seats + SSO + audit log export + 24/7 support. That's 5× cheaper than Snyk at the team tier and we do things they don't."

## Next steps

Hand the prospect the repo link and this line: *"If it takes you more than 10 minutes to have your first real scan running locally, I will buy you a coffee."*
