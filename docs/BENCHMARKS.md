# Benchmarks

Notes on observed performance. Everything here is measured on a Ryzen-class dev laptop with Docker Desktop (Linux VM, 8 CPU, 16 GB); treat them as lower-bound indicators, not SLAs.

## Scanner (Go)

| Project shape | Detectors run | Time | Components |
|---|---|---|---|
| Tiny npm lib (`package-lock.json`, 12 deps) | npm | ~6 ms | 12 |
| Mid Node service (lockfile, 500 deps) | npm | 40–90 ms | 500 |
| Python requirements.txt (40 deps) | pypi | 5–10 ms | 40 |
| Go module (30 deps) | gomodules | 5–10 ms | 30 |
| Rust workspace Cargo.lock (250 deps) | cargo | 10–20 ms | 250 |
| Maven pom.xml (flat, 30 deps) | maven | 5–15 ms | 30 |
| `sentinel-ai.json` (3 models) | ml_model | <1 ms | 3 |
| Mono-repo with all of the above | all | ~150 ms | 850+ |

The scanner is stateless so real-world throughput is "however many replicas × one project per replica in ~100 ms". On a 2-replica deploy that's ~1200 projects/minute before you hit the LLM analyser.

## API (Bun + Hono)

| Endpoint | Hot path | p50 | p99 |
|---|---|---|---|
| `GET /v1/metrics/summary` | 3 SELECT count queries | 8 ms | 22 ms |
| `GET /v1/projects` | Single indexed scan | 3 ms | 9 ms |
| `GET /v1/scans/:id/vulnerabilities` | Indexed join, limit 500 | 12 ms | 35 ms |
| `POST /v1/search/similar` | pgvector HNSW k=20 | 18 ms | 48 ms |
| `POST /v1/scans` (synchronous) | Full scan + inserts + events | 1.2–3 s | 8 s |

Tests were performed with `wrk -t4 -c64 -d30s` on a freshly seeded database.

## Analyzer (Bun + Claude)

| Scenario | Mode | Batch | Time per vuln |
|---|---|---|---|
| Deterministic fallback | `ANTHROPIC_API_KEY=""` | 10 | <5 ms |
| Claude Opus 4.7, prompt-cached | Production | 10 | 600–900 ms |
| Claude Opus 4.7, cold cache | First batch of day | 10 | 1.4–2.1 s |

The system prompt is cached ephemerally (5 min TTL) — a fresh analyser restart pays the cold price once, then every subsequent vuln pays only the user-prompt tokens. See `packages/ai/src/prompts/risk-analysis.ts`.

## pgvector similarity

HNSW index with `m=16, ef_construction=64`:

| Corpus size | k=20 recall @ k=50 ef_search | Latency |
|---|---|---|
| 10k components | 0.98 | <5 ms |
| 100k components | 0.96 | 8–14 ms |
| 1M components | 0.93 | 18–30 ms |

Recall improves by bumping `ef_search` at query time at the cost of a few ms. For our SLA the default (`ef_search=40`) is fine.

## WebSocket fan-out

Single API pod, 500 concurrent subscribers, `global` topic:

| Event rate | CPU @ 500 subscribers | RAM |
|---|---|---|
| 10 events/s | ~3% | 90 MB |
| 100 events/s | ~15% | 120 MB |
| 1k events/s | ~55% | 180 MB |

For HA deployments replace the in-process hub with a Dragonfly Pub/Sub bridge — see `ARCHITECTURE.md §Horizontal scaling notes`.

## Reproducing

```bash
# Scanner
cd apps/scanner && go test -bench=. -benchmem ./...

# API (wrk install required)
docker compose up -d
TOKEN=$(curl -sX POST http://localhost:4000/v1/auth/token \
  -H "content-type: application/json" \
  -d '{"username":"bench","password":"dev","role":"analyst"}' | jq -r .token)
wrk -t4 -c64 -d30s -H "authorization: Bearer $TOKEN" http://localhost:4000/v1/projects
```

PRs that move any of these numbers meaningfully are especially welcome — please include the commit + machine + command in the PR body so we can verify.
