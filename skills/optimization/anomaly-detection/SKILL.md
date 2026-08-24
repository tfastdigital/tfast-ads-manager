---
name: anomaly-detection
description: "Detect and triage anomalies in a client's performance data — spend spikes, CPA jumps, ROAS collapses, conversion drops — using the TFast detectors. Use for 'anything weird going on' or anomaly triage."
---
# TFast Anomaly Detection

The TFast platform runs deterministic detectors over 1/3/7/14/30-day windows (Morning Brief). This skill triages what they surface.

## Anomaly classes

| Class | Signal | First question |
|---|---|---|
| Spend spike | spend ↑ ≥ 50% vs prior window | Intentional (approved scale) or runaway? |
| CPA jump | CPA ↑ ≥ 20% with conversions | Creative? Funnel? Auction? (see `campaign-diagnosis`) |
| ROAS collapse | ROAS ratio < 0.8× prior | Revenue-side (AOV/mix) or conversion-side? |
| Conversion drop | conversions ↓ ≥ 40%, spend stable | Tracking break vs real demand drop |
| Tracking gap | zero data for N days | Platform outage, pixel/Events API break |

## Triage order

1. **Tracking first** — a tracking break explains every other anomaly at once. Check event flow before touching budgets.
2. **One-off vs trend** — single-day moves are noise (TikTok especially); require 2+ day trends (3-day rolling).
3. **Intentional changes** — check the change log / approvals; an approved +20% scale explains a spend spike and is NOT an anomaly.
4. **Root cause via chain** — frequency ↑ → VVR ↓ → CPA ↑ = fatigue. CPM ↑ + CTR stable = auction. CTR stable + CVR ↓ = funnel.

## Response rules

- Never react to an anomaly with an immediate budget cut — diagnose first, then act through the gateway pipeline.
- Anomalies that match an active experiment's window are experiment data, not incidents — route to the Experiment Agent.
- Flag, don't fix silently: every response goes through the approval policy, and the audit trail records why.

## Output

Anomaly table: entity, metric, magnitude, window, class, verdict (act / watch / noise), and the evidence chain.
