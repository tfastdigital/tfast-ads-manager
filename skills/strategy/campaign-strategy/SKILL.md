---
name: campaign-strategy
description: "Build a campaign strategy for a TFast client — objective, funnel structure, platform split, and budget allocation grounded in the Client Brain and research. Use for 'create a strategy for client X' or new-launch planning."
---
# TFast Campaign Strategy

Produce a campaign strategy from the Client Brain (never from scratch).

## Inputs (load first)

- Client Brain: `GET /api/v1/clients/{id}/brain` — business, customers, economics, advertising_history, competitors.
- Latest research: `GET /api/v1/clients/{id}/research` + market insights.
- Portfolio context: what's already running (campaigns table / reports).

## Strategy sections

### 1. Objective
One primary objective per launch, from economics: purchases → ROAS/CPA; leads → CPL. Never mix "we want sales and awareness" — pick the business outcome and let the platform optimize for it.

### 2. Funnel structure
```
Prospecting (broad/lookalike) → Retargeting (custom audiences) → CRM
```
- Prospecting gets 70–80% of budget on TikTok/Meta (broad targeting rewarded).
- Retargeting is cheap but demand-limited — cap it.
- Name the dependency: cutting prospecting starves retargeting pools.

### 3. Platform split
| Platform | Role | When |
|---|---|---|
| TikTok | Volume + creative-driven discovery | Video-first clients, younger audiences |
| Meta | Scale + full-funnel control | Most clients; strongest retargeting |
| Google Ads | Intent capture (Search/Shopping) | When demand exists (search volume) |

Base the split on the client's audience and creative assets — not on agency habits.

### 4. Budget
Derive from economics: monthly budget → daily caps per campaign. The Budget Governor enforces limits in code; your strategy must fit inside them (max 20–30% per scaling step, new-campaigns-per-day cap).

### 5. KPIs
ROAS/CPA targets per stage, taken from the brain's economics section. Prospecting judged on CPA/ROAS with looser tolerance early; retargeting on efficiency.

## Output

A strategy doc: objective, funnel, platform split with rationale, budget table, KPI table, and 3 first actions. Persist the plan to `ai_knowledge` brain section.
