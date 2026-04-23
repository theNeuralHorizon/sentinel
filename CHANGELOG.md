# Changelog

All notable changes to Sentinel are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Sentinel adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-04-23

### Initial public release

**Platform**
- Monorepo with four services (API, scanner, analyzer, web) and a CLI
- Bun 1.3 + Hono for the API (native TS, ~3× Node's HTTP throughput)
- Go 1.22 for the scanner (single static binary, integrates with syft ecosystem)
- SvelteKit 5 + Tailwind v4 for the dashboard (Runes-based reactivity, CSS-first theming)
- Drizzle ORM over Postgres 17 + pgvector (HNSW index for sub-ms component similarity)
- Dragonfly for cache + rate-limit (25× Redis throughput, drop-in wire protocol)
- NATS JetStream for events, bridged onto the dashboard WebSocket

**Scanners**
- npm (package-lock.json v3 + fallback to package.json)
- PyPI (requirements.txt)
- Go modules (go.mod)
- HuggingFace models + datasets (via `sentinel-ai.json`)
- MCP servers (via `.mcp.json` / `mcp.config.json`)
- Built-in OSV-style advisory catalog with six seeded CVEs for demos

**Risk & governance**
- Baseline risk engine combining CVSS, EPSS, license risk, transitive flag, fix availability, popularity
- AI risk analyzer (Claude Opus 4.7) with Zod-validated JSON output and prompt caching
- Deterministic fallback when no API key is present — Sentinel works fully offline
- Policy engine with 10 operators and 6 actions (allow/warn/block/escalate/remediate/notify)
- License classifier with 20+ SPDX entries + keyword fallback for unknown identifiers

**Autonomous remediation**
- Eight remediation kinds with an n8n webhook per kind
- Four production-ready n8n workflow templates (PR bump, issue ticket, Slack notify, PagerDuty escalate)
- Human-in-the-loop by default; approval required to dispatch

**Developer experience**
- `sentinel-cli scan | diff | export`
- Seed script with three demo projects, three policies, four real CVEs
- OpenTelemetry collector preconfigured for local development
- Docker Compose for one-command local bring-up
- Kubernetes manifests + Helm chart for production deploys
- CI: GitHub Actions with TypeScript + Go matrix, gitleaks, Trivy, OSV-Scanner, CodeQL, Syft SBOM attestation
- Release: signed images + SBOM attestations via cosign

**Security defaults**
- JWT auth on every `/v1` route
- Rate limiting per API key per route per minute
- Dev token minter disabled in production
- Containers run non-root with dropped caps + read-only root filesystem
- CORS locked down to configured origins

**Docs**
- README with stack rationale
- ARCHITECTURE, API, QUICKSTART, POLICIES, DEPLOYMENT, RESEARCH, DEMO
- CONTRIBUTING, SECURITY, CLAUDE.md for agentic contributors

[Unreleased]: https://github.com/theNeuralHorizon/sentinel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/theNeuralHorizon/sentinel/releases/tag/v0.1.0
