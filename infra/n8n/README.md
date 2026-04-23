# Sentinel n8n workflows

These workflows are imported into n8n at first boot (mount this folder at
`/workflows` and use `n8n import:workflow --separate --input=/workflows`).

Each workflow is named `sentinel-<kind>` where `<kind>` is one of the
`remediation_kind` enum values. The API dispatches a remediation via an n8n
webhook at `/webhook/sentinel-<kind>` with this JSON body:

```json
{
  "remediationId": "uuid",
  "vulnerabilityId": "uuid",
  "kind": "pr_bump",
  "advisoryId": "GHSA-...",
  "reasoning": "...",
  "parameters": { ... }
}
```

## Workflows

| File | Kind | Action |
|------|------|--------|
| `pr-bump.json` | `pr_bump` | Opens a GitHub PR bumping the vulnerable dependency |
| `issue-ticket.json` | `issue_ticket` | Opens a GitHub issue for human triage |
| `notify-slack.json` | `notify_slack` | Posts an alert to a Slack channel |
| `escalate-oncall.json` | `escalate_oncall` | Triggers a PagerDuty incident |

## Configuring credentials

The workflows expect n8n credentials named:

- `GitHub API` — personal access token with `repo` scope
- `Slack` — Bot User OAuth Token (`xoxb-...`) with `chat:write`
- `PAGERDUTY_ROUTING_KEY` — set as an n8n environment variable

## Customising

Clone any workflow, edit the GitHub owner/repo, add conditional branches (e.g.
only open a PR during business hours), or chain in Jira/Linear nodes. Sentinel
will dispatch whatever name you give the workflow as long as it starts with
`sentinel-`.
