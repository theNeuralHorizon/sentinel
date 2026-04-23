# Sentinel

> **AI-Native Software Supply Chain Security with Autonomous Remediation**

[![CI](https://github.com/theNeuralHorizon/sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/theNeuralHorizon/sentinel/actions/workflows/ci.yml)
[![Security](https://github.com/theNeuralHorizon/sentinel/actions/workflows/security.yml/badge.svg)](https://github.com/theNeuralHorizon/sentinel/actions/workflows/security.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun%201.3-yellow?logo=bun)](https://bun.sh)
[![SvelteKit 5](https://img.shields.io/badge/ui-SvelteKit%205-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![CycloneDX 1.6](https://img.shields.io/badge/SBOM-CycloneDX%201.6-blue)](https://cyclonedx.org)
[![pgvector](https://img.shields.io/badge/vectors-pgvector-336791?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Tests](https://img.shields.io/badge/tests-46%20bun%20%2B%206%20go-brightgreen)](#)

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

## Documentation

- [QUICKSTART](docs/QUICKSTART.md) — 5-minute local bring-up
- [ARCHITECTURE](docs/ARCHITECTURE.md) — every service, every data flow
- [API reference](docs/API.md)
- [POLICIES](docs/POLICIES.md) — authoring declarative governance rules
- [DEPLOYMENT](docs/DEPLOYMENT.md) — Kubernetes, Helm, hardening, backups, air-gapped
- [AI_SECURITY](docs/AI_SECURITY.md) — OWASP LLM Top 10 coverage + threat model
- [BENCHMARKS](docs/BENCHMARKS.md) — numbers, reproduction commands
- [FAQ](docs/FAQ.md) — stack choices, ownership, compliance, perf
- [RESEARCH](docs/RESEARCH.md) — the 2026 industry context driving this
- [ROADMAP](docs/ROADMAP.md) — what's next, what's not planned
- [DEMO](docs/DEMO.md) — 10-minute buyer walkthrough script
- [CONTRIBUTING](CONTRIBUTING.md) · [SECURITY](SECURITY.md) · [CHANGELOG](CHANGELOG.md) · [CLAUDE.md](CLAUDE.md)

## Status

All services pass CI: lint + typecheck + 55 Bun tests + 8 Go tests + integration seed + 4-image container build matrix. Security workflow: gitleaks + Trivy FS + OSV-Scanner + CodeQL (Go + JS/TS) + SBOM attestation.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Sources & Inspiration

- Cloudsmith — [The 2026 Guide to Software Supply Chain Security: From Static SBOMs to Agentic Governance](https://cloudsmith.com/blog/the-2026-guide-to-software-supply-chain-security-from-static-sboms-to-agentic-governance)
- Sonatype — [2026 State of the Software Supply Chain](https://www.sonatype.com/state-of-the-software-supply-chain/2026/software-compliance)
- OpenSSF — [Software Supply Chain Security Working Group](https://openssf.org/tag/software-supply-chain-security/)
- Anchore — [Syft & Grype](https://anchore.com/opensource/)
- NIST — AI Risk Management Framework (AI-BOM / ML-BOM)
