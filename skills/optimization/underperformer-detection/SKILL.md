---
name: underperformer-detection
description: "Find pause candidates across a client's accounts using TFast Morning Brief findings and platform reports, with strict pause-matrix discipline. Use for 'what should we pause' or cleanup passes."
---
# TFast Underperformer Detection

Find the waste. Sources: Morning Brief (critical findings), platform reports through the gateways, and the guardrail pause matrices.

## Pause matrix (applies to every platform)

| Condition | Action |
|---|---|
| Ad has highest conversion volume in its group | **KEEP** — algorithm concentration is correct, not a problem |
| Ad with 0 conversions AND spend > 2× CPA target | PAUSE |
| Ad with conversions but CPA > 3× group average AND 3+ conversions | PAUSE |
| Ad with 1–2 conversions, high CPA | WATCH — insufficient data |
| Ad younger than 7 days | WATCH — learning phase |

## Waste classes to hunt

1. **Zero-conversion spend** — entities burning > 2× CPA with nothing back.
2. **Over-funded underperformers** — budget % >> revenue % (portfolio/brief exposes this).
3. **Funnel-broken groups** — CTR stable, CVR collapsed (page problem, not creative).
4. **Out-of-target leakage** — breakdowns showing budget eaten by wrong segments/placements.

## Rules

- Never pause the top converter — the self-check question before every pause recommendation: "Am I about to pause the ad that drives the most conversions in this group?"
- Pauses are mutations → they flow through the gateway pipeline (dry-run → approval → governor → audit). Autopilot covers `pause_underperforming_ad` per default policy; recommend, don't assume execution.
- If data is noisy or contradictory → say **insufficient data**, shift to structured testing.

## Output

Pause list: entity, evidence (spend, CPA vs target, days live), matrix verdict, and the expected freed budget. Include a "watch" list for entities not yet eligible.
