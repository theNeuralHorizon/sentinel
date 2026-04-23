# Quickstart

Get Sentinel running against a real codebase in under 5 minutes.

## Prerequisites

- Docker + Docker Compose
- Bun 1.3 (for the CLI & dev mode)
- (optional) an Anthropic API key if you want real LLM-grade reasoning; without it Sentinel runs in deterministic-baseline mode and is fully functional

## 1. Bring up the stack

```bash
cp .env.example .env
# Optionally add ANTHROPIC_API_KEY=sk-ant-... to .env

docker compose up -d
```

Wait ~30s for Postgres and n8n to finish their first-boot migrations. Check with:

```bash
docker compose ps
```

You should see `postgres`, `dragonfly`, `nats`, `minio`, `n8n`, `api`, `scanner`, `analyzer`, and `web` all `healthy`.

## 2. Initialise the schema + seed demo data

```bash
# First-run only — applies 0000_init.sql
docker compose exec -T postgres psql -U sentinel -d sentinel < packages/db/migrations/0000_init.sql

# Seed 3 demo projects, 3 policies, a scan with real vulnerabilities
bun run scripts/seed.ts
```

## 3. Open the dashboard

```
http://localhost:5173
```

Sentinel auto-logs-in with a dev token the first time you visit. Explore:

- **Overview** — live stats, top risks, severity distribution, real-time feed
- **Projects** — trigger a new scan against any mounted directory
- **Vulnerabilities** — AI-enriched CVE list
- **Remediations** — approve AI-proposed fixes; watch them dispatch to n8n
- **NL Query** — semantic search over your component graph
- **Policies** — declarative governance rules

## 4. Scan your own project

### Via the web UI
Projects → **Trigger scan**. Set `workDir` to a path mounted inside the scanner container (by default the scanner mounts `/workspace`; add your own volume in `docker-compose.override.yml`).

### Via the CLI

```bash
bun install -g  # builds the workspace once
bun run apps/cli/src/index.ts scan ./my-project \
  --api http://localhost:4000 \
  --token "$(curl -s -X POST http://localhost:4000/v1/auth/token \
    -H 'content-type: application/json' \
    -d '{"username":"alice","password":"dev","role":"analyst"}' | jq -r .token)"
```

### Via CI/CD

Add to your pipeline:

```yaml
- name: Sentinel scan
  run: |
    curl -s -X POST $SENTINEL_URL/v1/scans \
      -H "authorization: Bearer $SENTINEL_TOKEN" \
      -H "content-type: application/json" \
      -d '{
        "projectSlug": "'"${{ github.event.repository.name }}"'",
        "workDir":     "'"$GITHUB_WORKSPACE"'",
        "commitSha":   "'"$GITHUB_SHA"'",
        "gitRef":      "'"$GITHUB_REF_NAME"'",
        "triggeredBy": "github-actions"
      }'
```

## 5. Wire n8n for auto-remediation (optional)

1. Open `http://localhost:5678`.
2. Create a user (first-boot prompt).
3. Import each workflow from `infra/n8n/workflows/*.json`.
4. Configure credentials:
   - **GitHub API** (for `pr_bump` and `issue_ticket`)
   - **Slack** (for `notify_slack`)
   - Environment variable `PAGERDUTY_ROUTING_KEY` (for `escalate_oncall`)
5. Activate each workflow (toggle in n8n top-right).

Now when you click **Approve & Dispatch** on a remediation, Sentinel fires the corresponding n8n webhook and the real-world action happens.

## Next steps

- [Architecture](./ARCHITECTURE.md) — understand the system end-to-end
- [API reference](./API.md) — integrate Sentinel with your pipelines
- [Kubernetes deploy](../infra/helm/sentinel) — production Helm chart
- [Writing custom policies](./POLICIES.md) — author governance rules
