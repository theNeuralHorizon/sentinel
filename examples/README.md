# Examples

Copy-paste-able configs you'll probably want the first time you deploy Sentinel.

## `sentinel-ai.json`

Drop this at the root of any project. Sentinel's scanner treats the listed models and datasets as first-class components — they appear on the overview dashboard under "AI supply chain", get a purl (`pkg:huggingface/...` or `pkg:hf-dataset/...`), and participate in policy evaluation just like any npm or PyPI package.

## `mcp.config.json`

If your team uses MCP servers (Claude Desktop, Cursor, Continue, …), Sentinel picks up the config automatically. Drop this file at the repo root or rely on the existing `.mcp.json` your tooling already writes.

## `policy-auto-bump.json`

A ready-to-POST policy that auto-opens PRs for direct, fixable medium+ vulnerabilities. To install:

```bash
curl -sX POST http://localhost:4000/v1/policies \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d @examples/policy-auto-bump.json
```

Pair with the `sentinel-pr_bump` n8n workflow (pre-seeded in `infra/n8n/workflows/pr-bump.json`) to close the loop.
