---
name: portfolio-analysis
description: "Cross-client portfolio analysis for TFast agencies — compare spend efficiency, ROAS, CPA and growth across clients, identify concentration risk, and surface reallocation candidates. Use for weekly portfolio reviews or 'how is the whole agency doing'."
---
# TFast Portfolio Analysis

Cross-client analysis. Use `GET /api/v1/portfolio/summary` plus per-client Morning Briefs (`POST /api/v1/jobs/morning-brief` with client_id) as the data sources.

## Dimensions

### 1. Efficiency ranking
Rank clients by ROAS (revenue/spend) and CPA vs their Client Brain targets. Never rank by raw spend — a big-spending client can be the worst performer.

### 2. Concentration risk
Compute each client's share of total agency spend. Flag when any single client exceeds 40% of portfolio spend — one client's failure becomes the agency's failure.

### 3. Reallocation candidates
- Client ROAS ≥ 1.2× target with budget utilization ≥ 90% → **scale** (subject to budget governor: max 20–30% per step).
- Client ROAS < 0.8× target for 14+ days → **diagnose before funding more** — more budget does not fix a broken funnel.
- Client with 0 spend for 7+ days → onboarding or tracking problem.

### 4. Trend comparison
Compare 7d vs prior 7d per client. Two clients can have the same ROAS but opposite trajectories — trajectory wins for decisions.

## Output

| Client | Spend | ROAS | Target | CPA | 7d trend | Verdict |
|---|---|---|---|---|---|---|
| … | … | … | … | … | ↑/↓/→ | Scale / Hold / Diagnose / Fix tracking |

End with 3–5 agency-level recommendations. All scale recommendations must respect `tiktok-guardrails` / platform guardrail skills (no ad-level budgets, 20–30% max steps, top-performer protection).
