# Security Policy

## Reporting a vulnerability

Please do NOT open a public GitHub issue for security vulnerabilities.

Email: **security@theneuralhorizon.local** (or open a private advisory via GitHub's "Security" tab).

We aim to:

- Acknowledge receipt within 24 hours
- Publish a fix or mitigation guidance within 7 days for critical issues, 30 days for high, 90 days for medium/low

## Supported versions

Until we reach `v1.0.0`, security fixes ship on `main` only. From `v1.0.0` onward we maintain the latest minor for 12 months.

## Hardening defaults

Sentinel ships with production-safe defaults:

- JWT secrets are required at boot; no dev fallback in `NODE_ENV=production`
- Container images run non-root with `readOnlyRootFilesystem` and all capabilities dropped
- Rate limiting enabled by default (120 req/min per API key per route)
- CORS is restrictive by default — allow-list `http://localhost:5173` only
- Dev token minter refuses in production unless `SENTINEL_DEV_TOKEN_MINTER=1`
- Database connection pooling with sane limits; no unprepared statements on the hot path

## Supply chain hardening

We practice what we ship:

- Every release is signed with cosign
- Every release image carries an SBOM attestation
- CI runs gitleaks, Trivy, OSV-Scanner, CodeQL, and Syft on every push
- Dependabot + Renovate keep transitive dependencies current
