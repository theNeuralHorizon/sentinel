# Deploying Sentinel on Vercel + Render

This is the single blessed public-cloud path. You'll end up with:

- **Web dashboard** on Vercel (SvelteKit, auto-adapted)
- **API + scanner + analyzer** on Render (Docker)
- **Postgres 17 + pgvector** on Render (managed)
- **Dragonfly-role KV** on Render Key-Value (Redis protocol)
- **n8n** on Render (official Docker image, managed Postgres backend)
- **CI/CD** via GitHub Actions — `deploy.yml` runs **only after** CI is green, then triggers Vercel + Render deploy hooks

Plan: one-time setup, then every push to `main` auto-deploys.

---

## 0 · Prereqs

- GitHub repo pushed (this one)
- Vercel account (free tier OK for the web)
- Render account (free tier works but API needs to stay warm — Starter plan recommended, $7/mo each)
- (optional) Custom domain for both `app.*` (Vercel) and `api.*` (Render)
- (optional) `ANTHROPIC_API_KEY` — omit for deterministic-fallback mode

---

## 1 · Provision Render backend (one click via Blueprint)

1. https://dashboard.render.com → **New** → **Blueprint**
2. Connect this repo, point at `render.yaml`
3. Render parses the blueprint and shows: **sentinel-api** (web), **sentinel-scanner** (private), **sentinel-analyzer** (worker), **sentinel-n8n** (web), **sentinel-postgres** (db), **sentinel-kv** (KV)
4. Click **Apply**. First build takes ~8 min because Docker images are cold
5. Once the API is live, note its public URL — e.g. `https://sentinel-api.onrender.com`

### Post-provision tasks

**Enable pgvector.** SSH / psql into `sentinel-postgres` and run the initial migration — this also creates the extension:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 < packages/db/migrations/0000_init.sql
```

> The migration file starts with `CREATE EXTENSION IF NOT EXISTS vector;` — it's idempotent, safe to re-run.

**Fill in the manual env vars** (marked `sync: false` in `render.yaml`) via Render dashboard → each service → Environment:

| Service | Variable | Value |
|---|---|---|
| `sentinel-api` | `ALLOWED_ORIGINS` | `https://<your-vercel-domain>.vercel.app` (comma-separated for multiples) |
| `sentinel-api` | `ANTHROPIC_API_KEY` | `sk-ant-…` (optional) |
| `sentinel-api` | `N8N_API_KEY` | API key from n8n UI (optional) |
| `sentinel-analyzer` | `ANTHROPIC_API_KEY` | same value (optional) |

**Seed demo data** (one-time, optional):

```bash
# From your laptop with DATABASE_URL exported to the Render connection string:
bun install
DATABASE_URL="<render-postgres-connection-string>" bun run scripts/seed.ts
```

---

## 2 · Provision Vercel frontend

1. https://vercel.com → **Add New… → Project**
2. Connect this repo
3. Framework Preset: **SvelteKit** (auto-detected via `vercel.json`)
4. **Root directory:** leave as `./` (the monorepo root — `vercel.json` handles workspace routing)
5. Add one environment variable:

   | Variable | Value |
   |---|---|
   | `VITE_PUBLIC_API_URL` | `https://sentinel-api.onrender.com` |
   | `VITE_PUBLIC_WS_URL` | `wss://sentinel-api.onrender.com/ws` |

6. **Deploy.** First build ~3 min.

---

## 3 · Wire the two halves together

After the first deploys:

1. **Update `ALLOWED_ORIGINS` on Render `sentinel-api`** with the Vercel production URL and any preview domain you want to allow. Redeploy the API service (one click).
2. Smoke-test from your browser: open the Vercel URL → it should dev-login, render the dashboard, fetch from the Render API. If you see `Failed to fetch`, CORS hasn't propagated — wait 30s and retry.

---

## 4 · GitHub Actions CI/CD

The `deploy.yml` workflow deploys on **every successful CI run** against `main`. Configure these GitHub secrets at **Settings → Secrets and variables → Actions**:

### Required

| Secret | Where to get it | Purpose |
|---|---|---|
| `VERCEL_TOKEN` | Vercel account → Settings → Tokens → *Create* (scope: full) | CLI auth for `vercel deploy --prod` |
| `VERCEL_ORG_ID` | Run `vercel link` locally once, then read `.vercel/project.json` | Project binding |
| `VERCEL_PROJECT_ID` | Same `.vercel/project.json` | Project binding |
| `RENDER_API_HOOK` | Render → `sentinel-api` → Settings → **Deploy Hook** | Triggers the API redeploy |
| `RENDER_SCANNER_HOOK` | Render → `sentinel-scanner` → Settings → **Deploy Hook** | Triggers scanner redeploy |
| `RENDER_ANALYZER_HOOK` | Render → `sentinel-analyzer` → Settings → **Deploy Hook** | Triggers analyzer redeploy |

### Optional (but recommended — enables post-deploy smoke)

| Secret | Value | Purpose |
|---|---|---|
| `RENDER_API_URL` | `https://sentinel-api.onrender.com` | Post-deploy `verify.ts` target |
| `RENDER_SCANNER_URL` | `https://sentinel-scanner-<id>.internal-render.com` (Render internal; only used for health probe) | Scanner health check after redeploy |

### Environments (optional but worth it)

GitHub lets you require manual approval before a deploy job runs. Set this up at **Settings → Environments**:

- `production-web` — protects Vercel deploys
- `production-api`, `production-scanner`, `production-analyzer` — per-service Render deploys

Add reviewers and wait-timers as you need.

---

## 5 · What the workflow actually does

```
push main → CI (test + lint + build) → workflow_run trigger →
  gate job checks CI conclusion == success →
  parallel { Vercel deploy , Render hooks } →
  post-deploy verify.ts (18 live assertions)
```

Key guarantees:

- **No deploy without green CI.** The `gate` job is gated on `github.event.workflow_run.conclusion == 'success'`. Failed tests block.
- **No secrets in forked PRs.** `workflow_run` doesn't expose secrets to PR forks; the deploy workflow only runs against tags + main + manual dispatch.
- **No long-lived platform tokens on Render.** Deploy hooks are per-service URLs; rotate one without rotating all six.
- **Fail-fast disabled on the Render matrix** — a flaky scanner redeploy doesn't kill the API redeploy.
- **Live post-deploy smoke.** `scripts/verify.ts` runs 18 assertions against the production API; if any fail, the deploy job turns red even though the deploy succeeded.

### Manual dispatch

Skip one side while iterating:

```bash
gh workflow run deploy.yml -F skip_render=true   # web-only push
gh workflow run deploy.yml -F skip_vercel=true   # backend-only push
```

---

## 6 · Security hardening applied by default

Already baked in — but double-check after your first deploy:

| Control | Where | Verify |
|---|---|---|
| Production refuses known-demo JWT secrets | `apps/api/src/env.ts` | Render boot log should show the secret is a Render-generated value |
| `ALLOWED_ORIGINS` mandatory in prod | `apps/api/src/env.ts` | API exits if empty; check Render logs on first boot |
| CSP headers on every page | `apps/web/svelte.config.js` | `curl -sI https://<vercel>/ | grep content-security-policy` |
| HSTS + COOP/CORP + X-Frame-Options DENY | `vercel.json` | `curl -sI` again |
| Rate limit always on (Dragonfly-backed with in-memory fallback) | `apps/api/src/middleware/rate-limit.ts` | `X-RateLimit-Remaining` header |
| JWT required on all `/v1` routes | `apps/api/src/middleware/auth.ts` | `curl https://<api>/v1/projects` → `401` |
| Dev token minter refuses to run in prod | `apps/api/src/routes/auth.ts` | `curl -X POST .../v1/auth/token` → `403 dev_token_disabled` unless `SENTINEL_DEV_TOKEN_MINTER=1` |
| All images signed + SBOM attested | `.github/workflows/release.yml` | `cosign verify-attestation ghcr.io/<org>/sentinel-api:stable` |
| gitleaks + Trivy + OSV + CodeQL on every push | `.github/workflows/security.yml` | Green badge on the repo home page |

### Production auth

Sentinel ships a **dev** token minter at `/v1/auth/token` that refuses to run in `NODE_ENV=production` unless `SENTINEL_DEV_TOKEN_MINTER=1` is explicitly set. Before your first real user logs in, wire one of:

- **OIDC** — stand up any OIDC IdP (Auth0, WorkOS, Keycloak, Google) and have it mint RS256 JWTs with the same `{sub, role, tenant}` claims
- **Clerk / WorkOS drop-in** — both have SvelteKit SDKs; point their JWT at `API_JWT_SECRET`
- **Reverse-proxy auth** — Cloudflare Access or Render's built-in IP allow-list for internal-only deploys

Full OIDC integration is on the v0.3 roadmap (see [ROADMAP.md](./ROADMAP.md)).

---

## 7 · Post-deploy verification

Run the 18-assertion live check from your laptop or CI:

```bash
SENTINEL_API=https://sentinel-api.onrender.com bun run scripts/verify.ts
```

Green means:
- Liveness (`/`, `/healthz`, `/version`) ✓
- Auth (JWT mint + 401 on unauth) ✓
- Data plane (seed applied, vulns present, ML-BOM tracked) ✓
- Risk engine (PyYAML score ≥ 80) ✓
- Policy engine (AGPL blocks, MIT does not) ✓
- pgvector similarity ranked + in-bounds ✓
- NL query routing ✓
- Scanner reachable ✓

Any red line is a real regression — check `docker logs` / Render logs for the corresponding service.

---

## 8 · Day-2: rollbacks, scaling, costs

### Rollback

- **Vercel:** Deployments → previous successful → **Promote to production**
- **Render:** Service → Deploys → **Redeploy** a prior commit. (Can also point Render at a specific git tag.)

### Scaling

- Render → service → Scaling → bump `numInstances`. The API is stateless; scaling is safe.
- Postgres → upgrade plan in-place. pgvector HNSW handles the resize seamlessly.
- KV (Dragonfly role) → upgrade plan. No migration needed.

### Costs (as of 2026-04)

| Resource | Plan | $/mo |
|---|---|---|
| Render `sentinel-api` | Starter | 7 |
| Render `sentinel-scanner` | Starter | 7 |
| Render `sentinel-analyzer` | Starter | 7 |
| Render `sentinel-n8n` | Starter | 7 |
| Render Postgres | Starter (1 GB) | 7 |
| Render KV | Starter | 10 |
| Vercel web | Hobby | 0 |
| **Total (warm)** |  | **45** |

Free-tier Render works for demos but cold starts will make the 18-assertion verifier flaky.

---

## 9 · Troubleshooting

**CORS `No 'Access-Control-Allow-Origin'` in browser console**
→ `ALLOWED_ORIGINS` doesn't include your Vercel domain. Fix in Render dashboard, redeploy the API.

**`refusing to start: API_JWT_SECRET is a known demo value`**
→ You kept the `.env.example` default. Generate a real one: `openssl rand -hex 32`, paste into Render env.

**`refusing to start: ALLOWED_ORIGINS must be set in production`**
→ Same as above but for the origin list. Set it to at least one `https://…`.

**`relation "vulnerabilities" does not exist`**
→ You didn't run `0000_init.sql`. Apply it once via `psql`.

**Vercel build fails with `cannot find module '@sveltejs/adapter-vercel'`**
→ Run `bun install` to pick up the newly-added devDep. `bun.lock` must be committed.

**Render deploy hook returns 404**
→ The hook URL was regenerated. Re-copy from Render settings → update `RENDER_<SVC>_HOOK` in GitHub secrets.

**Webhook from n8n never fires**
→ n8n workflow isn't activated (toggle top-right in n8n UI), or the API's `N8N_URL` points at an inactive service. Check Render logs.

---

## 10 · Where everything lives

| File | Role |
|---|---|
| `render.yaml` | Render blueprint — single source of truth for all backend services |
| `vercel.json` | Vercel project config (framework, build command, headers, CSP-adjacent) |
| `apps/web/svelte.config.js` | Conditional adapter selection (Vercel vs Node) via `ADAPTER` env |
| `.github/workflows/deploy.yml` | CI-gated deploy pipeline (Vercel + Render) |
| `apps/api/src/env.ts` | Hard checks against insecure defaults on prod boot |
| `scripts/verify.ts` | 18-assertion live-stack smoke test |

Anything you want to change, change it here once and push. The rest falls out.
