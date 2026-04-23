# Roadmap

This is a living document. PRs that move items earlier are welcome; items in
"Later" are explicitly lower priority until someone needs them.

## v0.2.0 — Expanded coverage (next)

Theme: widen the scanner surface and close integration gaps.

- [ ] syft library integration — swap hand-rolled detectors for `syft sbom`
- [ ] Cargo detector (Cargo.toml + Cargo.lock)
- [ ] Maven detector (pom.xml + maven-dependency-tree)
- [ ] Container image SBOM (syft-based)
- [ ] Live OSV mirror — replace the built-in catalog with a full OSV-DB pull
- [ ] Voyage-3-large embedder in production, hash embedder for dev
- [ ] Per-project + per-tenant isolation in the API
- [ ] Export SPDX 3.0 alongside CycloneDX 1.6
- [ ] Signed remediation audit log (Rekor-style transparency log)

## v0.3.0 — Multi-tenant governance

Theme: enterprise. Multi-tenant, multi-region, compliance-grade.

- [ ] OIDC + SAML auth
- [ ] Tenant-scoped RBAC + audit log export (SIEM-ready)
- [ ] Postgres read replicas + PgBouncer for the metrics path
- [ ] Distributed lock on analyzer batch selection (Dragonfly `SET NX`)
- [ ] Slack app (not just webhook) — interactive approvals from Slack
- [ ] Compliance reports: CRA readiness, EO 14028 attestation bundle, NIST CSF 2.0 mapping

## v0.4.0 — Agentic remediation

Theme: stop requiring human approval for everything.

- [ ] Confidence-gated auto-dispatch — policy-driven thresholds for skipping approval
- [ ] Outcome learning: close the loop between dispatched remediations and their outcome (PR merged? Reverted? CVE re-opened?)
- [ ] Multi-step remediation plans — chain fixes across services
- [ ] Drift budgets — each project gets a "risk velocity" allowance; breaches auto-escalate

## Later

- [ ] Binary SBOM for Docker / OCI images — registry-scanning CLI
- [ ] Model card ingestion (HuggingFace, HAI Bench) for AI-BOM enrichment
- [ ] Prompt injection signature scanning for LLM components
- [ ] Dataset provenance tracking (copyrighted-content detection, PII scan)
- [ ] SLSA level 3 build provenance for every image
- [ ] Browser extension: inline vulnerability badges on GitHub, npm, PyPI
- [ ] VS Code extension: inline license + CVE warnings as you code

## Not planned

- Yet-another-scanner. We orchestrate; we don't replace Grype/Trivy/syft.
- Hosted SaaS. Self-hosted only until someone funds the SOC 2.
- Windows-native binaries for the scanner. The container is good enough.
