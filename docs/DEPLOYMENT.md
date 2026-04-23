# Deployment

Sentinel ships four container images (`sentinel-api`, `sentinel-analyzer`, `sentinel-scanner`, `sentinel-web`) plus three stateful services (Postgres 17 + pgvector, Dragonfly, NATS JetStream) and one automation service (n8n). This guide covers local, Kubernetes, and hardening.

## Local (Docker Compose)

See [QUICKSTART.md](./QUICKSTART.md). `docker compose up -d` plus one schema apply is the whole story.

## Kubernetes (raw manifests)

Every resource lives under `infra/k8s/` and is Kustomize-ready.

```bash
kubectl apply -k infra/k8s/

# First-run only
kubectl exec -n sentinel statefulset/sentinel-postgres -- \
  psql -U sentinel -d sentinel < packages/db/migrations/0000_init.sql
```

The default manifests deploy:

- 2× API replicas with HPA (min 2, max 10 @ 70% CPU)
- 2× Scanner replicas
- 2× Analyzer replicas
- 2× Web replicas
- 1× Postgres StatefulSet (20 Gi PVC)
- 1× Dragonfly Deployment
- 1× NATS StatefulSet (5 Gi PVC)
- nginx Ingress with cert-manager annotations

### Point the Ingress at your domain

Edit `infra/k8s/web.yaml` and replace `sentinel.example.com`. For a managed cluster, add the matching DNS record pointing at your ingress-nginx LoadBalancer IP.

## Kubernetes (Helm)

```bash
helm install sentinel infra/helm/sentinel/ \
  --namespace sentinel --create-namespace \
  --set global.imageTag=v0.1.0 \
  --set secrets.anthropicApiKey=$ANTHROPIC_API_KEY \
  --set secrets.apiJwtSecret=$(openssl rand -hex 32)
```

Values are documented in `infra/helm/sentinel/values.yaml`.

## Hardening checklist

| Topic | Default | Production |
|---|---|---|
| JWT secret | `change-me…` | 32+ bytes from a secret manager (ExternalSecrets, SealedSecrets) |
| Postgres password | `sentinel` | Generated + rotated |
| Claude API key | `""` | From a secret manager only |
| Network | cluster-only | Ingress with TLS (cert-manager) + WAF |
| Backups | none | pgdump + Dragonfly snapshot cronjobs to S3 |
| Observability | OTel debug exporter | OTel → Grafana / Honeycomb / Datadog |
| Rate limiting | 120 req/min | Per-tenant, tuned per endpoint |
| Images | `:latest` | pinned + cosign-verified |

## Horizontal scaling notes

- **API** scales freely. All state lives in Postgres / Dragonfly / NATS. The WebSocket hub is in-process — for strict HA, run behind a sticky LB or swap in Dragonfly Pub/Sub.
- **Scanner** scales freely. Each pod uses a local scratch volume (`emptyDir` in k8s, named volume in compose); scans don't share state between pods.
- **Analyzer** scales, but watch for duplicate LLM calls on overlapping batches. A distributed lock (Dragonfly `SET NX`) around the batch selection is planned.
- **Web** scales freely; SSR is stateless.

## Backup & disaster recovery

Recommended cron:

```yaml
# Postgres daily
schedule: "0 4 * * *"
command: pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://sentinel-backups/postgres/$(date +%F).sql.gz

# Dragonfly is rebuild-from-empty safe (cache only)
# NATS JetStream streams have their own replication — enable for HA
```

## Upgrades

- **Minor (0.x.y → 0.x.y+1):** image bump. No migration needed.
- **Feature (0.x → 0.x+1):** always accompanied by a migration. See `packages/db/migrations/`.
- **Major (0.x → 1.0):** follow the release notes. We aim for zero-downtime with dual-read cutover.

Rolling upgrades work out of the box — our readiness probes mean kubectl rollout will drain in-flight requests before terminating pods.

## Offline / air-gapped deployments

Sentinel runs without outbound internet:

- Set `ANTHROPIC_API_KEY` to empty; all AI features fall back to deterministic baselines.
- Mirror images to a private registry; override `global.imageRegistry` in Helm.
- Point n8n webhooks at internal ITSM (Jira DC, GitHub Enterprise, Mattermost).
- The scanner's built-in advisory catalog is small by design; swap in an OSV mirror via `OSV_API_URL` for full coverage.

## Observability endpoints

| Service | Endpoint | Content |
|---|---|---|
| api | `/healthz`, `/readyz` | JSON; `readyz` exposes WS client count |
| scanner | `/healthz` | plain `200` |
| analyzer | `/healthz` | JSON |
| web | `/` | HTTP 200 for alive |
| OTel | `4317` (gRPC), `4318` (HTTP) | OTLP |
| Prometheus | `8889` | metrics exported by OTel collector |
| NATS | `8222/healthz` | cluster health |

## Validating your deployment

```bash
# 1. Every pod ready
kubectl get pods -n sentinel

# 2. API round-trip
TOKEN=$(curl -sX POST https://$HOST/v1/auth/token \
  -H 'content-type: application/json' \
  -d '{"username":"smoke","password":"dev","role":"analyst"}' | jq -r .token)
curl -s https://$HOST/v1/metrics/summary -H "authorization: Bearer $TOKEN" | jq '.overall'

# 3. WebSocket connection
websocat "wss://$HOST/ws?token=$TOKEN&topics=global"
```
