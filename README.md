# Sentinel

> **AI-Native Software Supply Chain Security with Autonomous Remediation**

[![CI](https://github.com/theNeuralHorizon/sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/theNeuralHorizon/sentinel/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Sentinel is an agentic governance platform for software supply chain security. It moves beyond static SBOMs to real-time, AI-driven risk intelligence with autonomous remediation via n8n workflows.

## The Problem

- **62% of security teams** have no visibility into where LLMs/AI components live in their stack ([VentureBeat, 2026](https://venturebeat.com/security/seven-steps-to-ai-supply-chain-visibility))
- The **EU Cyber Resilience Act** (effective 2027) and **US EO 14028/14144** mandate SBOMs and vulnerability attestations
- Traditional SBOM/CVE tools produce mountains of low-signal alerts with no business context
- License compliance across transitive dependencies is a manual, error-prone slog
- AI/ML supply chain (models, datasets, MCP servers) is a new, unmonitored attack surface

## The Solution

Sentinel treats your supply chain as a **living graph** and your remediation workflow as a **fleet of autonomous agents**:

1. **Multi-ecosystem scanning** — npm, Cargo, PyPI, Go modules, Maven, containers, **and ML/AI-BOM** (CycloneDX 1.6 + SPDX 3.0 AI profile)
2. **Semantic risk scoring** — LLM-powered analysis goes beyond CVSS: it reads CVE descriptions, your code context, and license texts to produce a business-aware risk score
3. **Vector-indexed provenance** — pgvector-backed similarity search answers *"what else is affected by something like log4shell?"* in milliseconds
4. **Agentic remediation** — n8n workflows automatically create PRs, open Jira tickets, rotate tokens, or page on-call based on the risk class
5. **Natural language queries** — *"What's my exposure to log4j?"* → instant answer grounded in your live SBOM graph
6. **Drift monitoring** — every release produces a signed SBOM; Sentinel diffs them and surfaces supply-chain regressions before they hit production

## New-Gen Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | **Bun 1.3** | ~3× Node's HTTP throughput, native TS, faster startup |
| API | **Hono** | Edge-ready, 130k+ req/s on Bun |
| Scanner | **Go** | Native syft/grype libraries, single-binary deploy |
| ORM | **Drizzle** | Type-safe, zero-overhead, serverless-first |
| Database | **Postgres 17 + pgvector** | Relational + vector in one engine |
| Cache/Queue | **Dragonfly** | 25× Redis throughput, drop-in compatible |
| Events | **NATS JetStream** | At-least-once, lightweight, HA |
| Frontend | **SvelteKit 5 + Tailwind v4** | Runes, fine-grained reactivity, CSS-first config |
| Automation | **n8n** | Self-hostable workflow engine, 500+ integrations |
| AI | **Claude Opus 4.7** | Reasoning for risk analysis + local embeddings |
| Deploy | **Docker + Kubernetes + Helm** | Production-grade, portable |
| CI/CD | **GitHub Actions** | Matrix builds, caching, cosign signing |

## Architecture

```
┌──────────────┐         ┌───────────────┐         ┌────────────────┐
│  SvelteKit   │────────▶│   Bun + Hono  │────────▶│   Go Scanner    │
│  Dashboard   │  WS     │   API Gateway │  gRPC   │   (SBOM/Grype)  │
└──────────────┘         └───────┬───────┘         └────────────────┘
                                 │
                         ┌───────┼───────┐
                         ▼       ▼       ▼
                 ┌─────────┐ ┌───────┐ ┌─────────────┐
                 │ Postgres│ │ Drag- │ │    NATS     │
                 │ pgvector│ │ onfly │ │  JetStream  │
                 └─────────┘ └───────┘ └──────┬──────┘
                                               │
                                 ┌─────────────┼──────────────┐
                                 ▼             ▼              ▼
                          ┌─────────┐   ┌──────────┐   ┌──────────┐
                          │Analyzer │   │   n8n    │   │ Workers  │
                          │ (Bun+AI)│   │ Remediate│   │  (Bun)   │
                          └─────────┘   └──────────┘   └──────────┘
```

## Quickstart

```bash
# Clone
git clone https://github.com/theNeuralHorizon/sentinel
cd sentinel

# Spin up the full stack
docker compose up -d

# Run a scan on a local repo
bun x sentinel-cli scan ./my-project

# Open the dashboard
open http://localhost:5173
```

See [docs/](docs/) for deep dives.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Sources & Inspiration

- Cloudsmith — [The 2026 Guide to Software Supply Chain Security: From Static SBOMs to Agentic Governance](https://cloudsmith.com/blog/the-2026-guide-to-software-supply-chain-security-from-static-sboms-to-agentic-governance)
- Sonatype — [2026 State of the Software Supply Chain](https://www.sonatype.com/state-of-the-software-supply-chain/2026/software-compliance)
- OpenSSF — [Software Supply Chain Security Working Group](https://openssf.org/tag/software-supply-chain-security/)
- Anchore — [Syft & Grype](https://anchore.com/opensource/)
- NIST — AI Risk Management Framework (AI-BOM / ML-BOM)
