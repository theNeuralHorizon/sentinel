# Writing Sentinel Policies

Policies are declarative JSON documents that evaluate against a **policy context** — a flat map of facts about a component, vulnerability, or scan. The same rule engine powers:

- **Scan-time gates** (e.g. block on critical + EPSS > 0.5)
- **Remediation triggers** (e.g. auto-dispatch `pr_bump` when severity = high AND fix exists)
- **Compliance reports** (e.g. "show every policy violation in the last release")

## Schema

```ts
type Policy = {
  slug: string;              // url-safe, e.g. "block-agpl"
  name: string;
  enabled: boolean;
  rules: {
    conditions: Array<{
      field: string;
      op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
        | "in" | "not_in" | "contains" | "matches";
      value: string | number | boolean | string[] | number[];
    }>;
    action: "allow" | "warn" | "block" | "escalate" | "remediate" | "notify";
    remediationKind?: string; // if action === "remediate"
    notify?: { channels: string[]; severity?: string };
  };
}
```

All conditions must match (logical AND). Use multiple policies for OR.

## Available fields

| Field | Where it comes from | Example |
|---|---|---|
| `severity` | vulnerability | `"critical"` |
| `cvss` | vulnerability | `9.8` |
| `epss` | vulnerability | `0.67` |
| `aiRiskScore` | vulnerability | `86` |
| `exploitability` | vulnerability | `"in_the_wild"` |
| `businessImpact` | vulnerability | `"severe"` |
| `ecosystem` | component | `"npm"` |
| `license` | component | `"AGPL-3.0"` |
| `licenseRisk` | component | `"critical"` |
| `isTransitive` | component | `true` |
| `purl` | component | `"pkg:npm/lodash@4.17.11"` |
| `componentName` | component | `"lodash"` |
| `projectSlug` | scan | `"payments-api"` |
| `scanKind` | scan | `"full"` |

## Examples

### Block AGPL everywhere

```json
{
  "slug": "block-agpl",
  "name": "Block AGPL and SSPL in proprietary code",
  "enabled": true,
  "rules": {
    "conditions": [
      { "field": "license", "op": "in", "value": ["AGPL-3.0", "SSPL-1.0", "CC-BY-NC-4.0"] }
    ],
    "action": "block"
  }
}
```

### Escalate exploitable criticals

```json
{
  "slug": "escalate-weaponised",
  "name": "Escalate weaponised critical vulns",
  "enabled": true,
  "rules": {
    "conditions": [
      { "field": "severity", "op": "eq", "value": "critical" },
      { "field": "exploitability", "op": "in", "value": ["weaponised", "in_the_wild"] }
    ],
    "action": "escalate",
    "notify": { "channels": ["#security-oncall"], "severity": "P1" }
  }
}
```

### Auto-PR for medium+ with fix available

```json
{
  "slug": "auto-bump-medium-plus",
  "name": "Auto-open PR for fixable medium+ vulns",
  "enabled": true,
  "rules": {
    "conditions": [
      { "field": "severity", "op": "in", "value": ["critical", "high", "medium"] },
      { "field": "fixAvailable", "op": "eq", "value": true },
      { "field": "isTransitive", "op": "eq", "value": false }
    ],
    "action": "remediate",
    "remediationKind": "pr_bump"
  }
}
```

### Warn on unknown licenses

```json
{
  "slug": "warn-unknown-license",
  "name": "Warn on undeclared licenses",
  "enabled": true,
  "rules": {
    "conditions": [{ "field": "licenseRisk", "op": "eq", "value": "unknown" }],
    "action": "warn"
  }
}
```

### ML-BOM compliance

```json
{
  "slug": "ml-model-provenance",
  "name": "ML models must have a declared supplier",
  "enabled": true,
  "rules": {
    "conditions": [
      { "field": "ecosystem", "op": "in", "value": ["ml_model", "dataset"] },
      { "field": "supplier", "op": "eq", "value": "" }
    ],
    "action": "block"
  }
}
```

## Testing a policy

```bash
curl -sX POST http://localhost:4000/v1/policies \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d @my-policy.json
```

The policy evaluates on every future scan. Existing scans aren't re-evaluated — trigger a new scan to see the rule in action.
