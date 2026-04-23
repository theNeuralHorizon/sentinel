# API Reference

Base URL (dev): `http://localhost:4000`
All `/v1/*` routes require `Authorization: Bearer <jwt>` except for `/v1/auth/token`.

## Authentication

### `POST /v1/auth/token`

Dev-only token minter. Refuses in `NODE_ENV=production` unless
`SENTINEL_DEV_TOKEN_MINTER=1`.

```json
POST /v1/auth/token
{ "username": "alice", "password": "dev", "role": "analyst" }

200 OK
{ "token": "eyJhbGciOiJ...", "claims": { "sub": "alice", "role": "analyst" } }
```

Roles: `admin`, `analyst`, `viewer`, `service`.

## Projects

### `GET /v1/projects`
Returns up to 200 projects.

### `POST /v1/projects`
```json
{ "slug": "payments-api", "name": "Payments API", "repoUrl": "https://github.com/org/payments" }
```

### `GET /v1/projects/:slug`
Returns a single project.

### `GET /v1/projects/:slug/scans`
Returns the last 50 scans for that project.

## Scans

### `POST /v1/scans`
Trigger a scan. The API queues the scan (returns `202`), then runs it against the scanner service asynchronously.

```json
{
  "projectSlug": "payments-api",
  "workDir": "/workspace/payments-api",
  "gitRef": "main",
  "commitSha": "abc123...",
  "kind": "full",
  "triggeredBy": "ci"
}
```

`kind` ∈ `full | incremental | drift | ml_bom`.

### `GET /v1/scans/:id`
Returns the scan row (status, counters, risk score).

### `GET /v1/scans/:id/components`
Returns up to 1000 components from a scan.

### `GET /v1/scans/:id/vulnerabilities`
Returns up to 500 vulnerabilities, ordered by `aiRiskScore DESC`.

## Search

### `POST /v1/search/similar`
Semantic similarity search over the component graph.

```json
{
  "query": "logging library similar to log4j",
  "topK": 20,
  "ecosystem": "maven"
}
```

Response:
```json
{
  "results": [
    { "name": "log4j-api", "version": "2.17.1", "purl": "...", "similarity": 0.92 }
  ]
}
```

### `GET /v1/search/components?name=lodash&ecosystem=npm`

## Remediations

### `GET /v1/remediations`

### `POST /v1/remediations/:id/approve`
```json
{ "approvedBy": "alice@corp" }
```
Transitions a `proposed` remediation to `queued`, then immediately dispatches to the matching n8n webhook. Returns the updated row including n8n `executionId`.

## Policies

### `GET /v1/policies`
### `POST /v1/policies`
### `PUT /v1/policies/:slug`

Policy body shape:
```json
{
  "slug": "block-agpl",
  "name": "Block AGPL in proprietary code",
  "enabled": true,
  "rules": {
    "conditions": [
      { "field": "license", "op": "in", "value": ["AGPL-3.0", "SSPL-1.0"] }
    ],
    "action": "block"
  }
}
```

`op` ∈ `eq | neq | gt | gte | lt | lte | in | not_in | contains | matches`.
`action` ∈ `allow | warn | block | escalate | remediate | notify`.

## Metrics

### `GET /v1/metrics/summary`

Returns the dashboard payload: overall counts, top-10 risks, per-ecosystem breakdown. One round-trip for the home page.

## WebSocket

### `ws://host/ws?token=<jwt>&topics=global,project:<uuid>,scan:<uuid>`

The server pushes JSON messages:
```json
{ "topic": "project:123...", "message": { "kind": "sentinel.scan.completed", "payload": { ... } } }
```

Client can also dynamically subscribe:
```json
{ "type": "subscribe", "topics": ["scan:abc..."] }
```

## Rate limiting

Every `/v1/*` route is rate-limited per-API-key per-route per-minute via Dragonfly.
Limits come back as `X-RateLimit-*` headers. Default: 120 req/min.

## Errors

Uniform JSON shape:
```json
{ "error": "short_slug", "detail": "optional human context" }
```

Standard codes: `400 invalid_body`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `429 rate_limited`, `502 upstream_failed`.
