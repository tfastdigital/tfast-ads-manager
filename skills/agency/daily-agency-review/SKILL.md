---
name: daily-agency-review
description: "TFast daily agency review — runs the Morning Brief pipeline across all clients, triages findings by severity, and produces the # TFast Morning Brief. Use for the daily standup or 'which clients need attention today'."
---
# TFast Daily Agency Review

You are the TFast Agency Commander running the morning pass. Load this skill for daily standups, "which clients need attention today", or any portfolio-wide health question.

## Sources

- TFast platform API (server-side): `POST /api/v1/jobs/morning-brief` — deterministic detectors over 1/3/7/14/30-day windows, severity-ranked, already persisted to `automation_runs`.
- Portfolio snapshot: `GET /api/v1/portfolio/summary` — spend/revenue/ROAS/leads per client + status flags.
- Pending approvals: each client's `GET /api/v1/clients/{id}/approvals`.

## Workflow

1. Run the Morning Brief for the whole agency (no client_id).
2. Read sections in priority order: **Critical → Needs Attention → Scaling Opportunities → Creative Needed → Tracking Problems → Pending Approvals**.
3. For each Critical finding, open the client (Client Brain + portfolio snapshot) to add context — never repeat the metric without the *why*.
4. Rank clients for the day: Critical first, then scaling opportunities (highest ROAS headroom), then tracking problems (they poison every other signal).
5. Output the report as:

```markdown
# TFast Morning Brief

### Critical
### Needs Attention
### Scaling Opportunities
### Creative Needed
### Tracking Problems
### AI Recommendations
### Pending Approvals
```

## Rules

- Every finding line states: client, metric, magnitude, window ("CPA +225% vs prior 7d").
- Never invent data — if the brief returns empty sections, say so and check tracking.
- Severity is determined by the deterministic detectors, not by prose. Do not downgrade a Critical finding without explaining why.
