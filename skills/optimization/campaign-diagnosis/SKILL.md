---
name: campaign-diagnosis
description: "Diagnose why a campaign underperforms — creative, funnel, audience, auction or tracking — using TFast Morning Brief findings and platform reports. Use for 'why is campaign X failing' or pre-optimization diagnosis."
---
# TFast Campaign Diagnosis

Diagnose before you act. Pull the campaign's Morning Brief findings, platform report (TikTok/Meta/Google gateways), and the funnel signals, then classify:

## Diagnosis tree

1. **Tracking** — no/frozen data → fix tracking first. Nothing else is trustworthy.
2. **Creative** — VVR/CTR decaying with rising frequency → fatigue (see `creative-fatigue`).
3. **Funnel** — CTR stable, CVR falling → landing page / offer mismatch (see `funnel-analysis`).
4. **Audience** — high CPM, low CTR across the board → audience too narrow/expensive or saturation (reach trend flat/falling).
5. **Auction** — CPM rising, CTR stable, impression share constrained → competitive pressure; check bid caps vs market price.
6. **Structure** — one ad group eating budget with weak results, or fragmented groups re-bidding against each other.

## Evidence requirements

Each diagnosis needs the chain: metric + direction + window ("VVR ↓35% over 3d while frequency 4.2"). Correlate timing across metrics to establish cause: frequency rising → VVR falling → CPA rising = fatigue, not audience exhaustion.

## Action mapping (respect guardrails)

| Diagnosis | Action |
|---|---|
| Creative fatigue | Refresh hooks; pause weakest ads in the group (never the top converter) |
| Funnel break | Fix landing page; pause ad group only if page can't be fixed |
| Audience saturation | Broaden or duplicate with looser targeting; new creatives for the pool |
| Auction pressure | Raise bid cap or accept — scaling budget into rising CPM is wasteful |
| Structure | Consolidate groups / extract winners per `tiktok-guardrails`-style rules |

One diagnosis, one action. Never stack three fixes at once — you won't know which worked.
