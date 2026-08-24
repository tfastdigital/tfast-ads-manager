---
name: client-priority-ranking
description: "Rank TFast clients by who needs media-buyer attention today. Combines severity of findings, financial exposure, and opportunity size into an ordered work list. Use for 'who should we look at first today'."
---
# TFast Client Priority Ranking

Rank clients into an ordered work list for the day.

## Scoring (deterministic inputs only)

For each client, gather from the TFast platform:

1. **Severity**: highest finding severity in the latest Morning Brief (`critical=100, warning=40, info=10`).
2. **Financial exposure**: 7d spend (higher spend = higher stakes).
3. **Opportunity**: scaling candidates from the brief (ROAS ≥ 1.1× target at ≥ 90% budget utilization).
4. **Tracking health**: any tracking-problem findings add +30 (bad data poisons every decision).

## Priority formula

```
score = severity + exposure_points + opportunity_bonus + tracking_penalty
exposure_points = min(30, 7d_spend / 100)
opportunity_bonus = 25 if scaling candidate else 0
tracking_penalty = 30 if tracking problems else 0
```

## Output

An ordered list, one line per client:

```
1. Client B — CRITICAL: ROAS 1.1 vs target 3.0, $3,120 spend. Action: diagnose funnel.
2. Client A — SCALE: ROAS 5.2, at 95% daily cap. Action: +20% budget step.
3. Client C — TRACKING: no events for 4 days. Action: fix pixel/Events API.
```

Tie-break by spend. Never put a tracking-broken client below a healthy one — you cannot trust any of its numbers.
