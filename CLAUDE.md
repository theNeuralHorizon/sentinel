# Guidance for AI agents working on this repo

Sentinel is a polyglot monorepo (Bun + Go + Svelte) with tight cross-package type sharing. Follow these rules to stay out of trouble.

## Mental model

- **`apps/api`** is the front door. Every external caller (UI, CLI, CI) goes through it. Add new endpoints here.
- **`apps/scanner`** is a stateless Go service whose only job is to walk a filesystem and emit `{components, vulnerabilities, sbom}`. It does not know about the DB.
- **`apps/analyzer`** is the slow-thinking worker. It reads the DB, talks to Claude, writes enrichments back. It does not accept external HTTP traffic.
- **`apps/web`** is a presentation layer. No business logic — everything is fetched from `/v1`.
- **`packages/shared`** is the canonical type home. When adding a new enum value (ecosystem, severity, remediation kind…), update: shared zod → db pg enum → migration → scanner Go enum.

## Hard rules

- **Never mutate data passed across module boundaries.** Return new objects. We rely on this for the dashboard's reactivity.
- **Never log secrets.** Prefer `logger.info({ redactedKeys: Object.keys(x) })` to dumping objects.
- **Never add a migration without also editing the initial SQL file.** Our dev flow still uses `0000_init.sql`; Drizzle-kit generation is a production concern.
- **Never commit a new ecosystem without a detector AND a test.** The Go scanner's `engine_test.go` must cover it.
- **Never bypass the JWT middleware.** New routes go under `authed`, not the top-level `app`.

## Adding a new API endpoint

1. New file in `apps/api/src/routes/<domain>.ts`.
2. Validate input with `zValidator("json", Schema)`.
3. Register under `authed.route("/<domain>", <your>Route)` in `src/index.ts`.
4. Document it in `docs/API.md`.
5. Add an integration test under `apps/api/test/`.

## Adding a new remediation kind

1. Add the enum value in:
   - `packages/db/src/schema/remediations.ts`
   - `packages/db/migrations/0000_init.sql`
   - `packages/ai/src/remediation.ts` (`RemediationPlanSchema`)
   - `packages/ai/src/prompts/remediation.ts` (prompt text)
2. Add an n8n workflow `infra/n8n/workflows/<kind>.json`.
3. Update `docs/API.md` and `docs/POLICIES.md`.

## Style

- **TypeScript**: strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any`.
- **Go**: `go vet` clean, table-driven tests.
- **Svelte 5**: use Runes (`$state`, `$derived`, `$effect`) — no legacy stores.
- **Commits**: conventional commits.

## When running the stack

- Use `docker compose up -d`, never pull individual services by hand.
- First-time DB init: `docker compose exec -T postgres psql -U sentinel -d sentinel < packages/db/migrations/0000_init.sql`, then `bun run scripts/seed.ts`.
- Claude API key is optional — Sentinel has deterministic fallbacks for every AI call.

## What tests to run before opening a PR

```bash
bun test                                   # bun unit tests (shared, ai, api, cli)
cd apps/scanner && go test ./...           # go scanner tests
bun --cwd apps/web check                   # svelte-check
```

CI also runs gitleaks, Trivy, OSV-Scanner, CodeQL, and builds all 4 container images.
