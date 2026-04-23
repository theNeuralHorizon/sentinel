#!/usr/bin/env bash
# End-to-end smoke test that exercises the full Sentinel stack.
# Run after `docker compose up -d` + seed. Exits non-zero on the first failure.
#
# Usage:
#   SENTINEL_API=http://localhost:4000 bash scripts/smoke.sh

set -euo pipefail

API="${SENTINEL_API:-http://localhost:4000}"
FAILED=0

pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAILED=1; }

jq_required() {
  command -v jq >/dev/null 2>&1 || { echo "jq is required"; exit 2; }
}

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

jq_required

step "1. Health probes"
curl -sf "$API/healthz" >/dev/null && pass "/healthz" || fail "/healthz"
curl -sf "$API/readyz"  >/dev/null && pass "/readyz"  || fail "/readyz"

step "2. Dev-login"
TOKEN=$(curl -sfX POST "$API/v1/auth/token" \
  -H 'content-type: application/json' \
  -d '{"username":"smoke","password":"dev","role":"analyst"}' | jq -r .token)
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] && pass "minted JWT" || fail "dev-login"

AUTH=(-H "authorization: Bearer $TOKEN")

step "3. Overview summary"
SUMMARY=$(curl -sf "${AUTH[@]}" "$API/v1/metrics/summary")
PROJECTS=$(echo "$SUMMARY" | jq -r '.overall.projects // 0')
[[ "$PROJECTS" -ge 0 ]] && pass "summary returns projects=$PROJECTS" || fail "summary"

step "4. Projects list"
PROJECTS_COUNT=$(curl -sf "${AUTH[@]}" "$API/v1/projects" | jq '.projects | length')
[[ "$PROJECTS_COUNT" -ge 0 ]] && pass "projects list works (count=$PROJECTS_COUNT)" || fail "projects list"

step "5. Policies list"
POLICIES=$(curl -sf "${AUTH[@]}" "$API/v1/policies" | jq '.policies | length')
[[ "$POLICIES" -ge 0 ]] && pass "policies list works (count=$POLICIES)" || fail "policies list"

step "6. Policy dry-run eval"
EVAL=$(curl -sfX POST "${AUTH[@]}" -H 'content-type: application/json' \
  -d '{"context":{"license":"AGPL-3.0","severity":"low"}}' \
  "$API/v1/policy-eval")
DECISION=$(echo "$EVAL" | jq -r .decision)
[[ "$DECISION" == "block" || "$DECISION" == "allow" ]] && \
  pass "policy-eval returned decision=$DECISION" || fail "policy-eval"

step "7. Semantic similarity"
RESULTS=$(curl -sfX POST "${AUTH[@]}" -H 'content-type: application/json' \
  -d '{"query":"logging library","topK":5}' \
  "$API/v1/search/similar" | jq '.results | length')
[[ "$RESULTS" -ge 0 ]] && pass "similarity returned $RESULTS results" || fail "similarity"

step "8. NL query"
NL=$(curl -sfX POST "${AUTH[@]}" -H 'content-type: application/json' \
  -d '{"question":"what about CVE-2020-14343"}' \
  "$API/v1/nl" | jq -r '.plan.mode')
[[ "$NL" == "vulnerability_lookup" ]] && pass "nl routed CVE to vulnerability_lookup" || fail "nl"

if [[ "$FAILED" -eq 0 ]]; then
  printf '\n\033[32mAll smoke checks passed.\033[0m\n'
  exit 0
fi

printf '\n\033[31mSmoke checks failed.\033[0m\n'
exit 1
