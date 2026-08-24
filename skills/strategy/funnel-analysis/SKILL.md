---
name: funnel-analysis
description: "Analyze a client's full funnel — ad → landing page → lead → qualification → purchase — to find where conversion breaks. Use for 'why is our CPA rising' or funnel audits. Pairs with the attribution skills."
---
# TFast Funnel Analysis

Find the break in the chain. Data sources: platform reports, the Morning Brief's funnel-break findings, and the attribution endpoints (`GET /api/v1/clients/{id}/attribution`).

## Funnel stages and their signals

| Stage | Signal | Break means |
|---|---|---|
| Ad attention | CTR, VVR, hook rate | Creative problem |
| Click intent | CVR (clicks → conversions) with stable CTR | Landing page or offer problem |
| Lead quality | qualified / leads ratio | Targeting or messaging attracts wrong people |
| Close rate | customers / qualified | Sales process or offer truth |
| Economics | contribution profit per campaign | Margin, not volume, is the problem |

## Diagnosis rules

- CTR stable + CVR falling → **landing page** (check load, message match, form friction) — the classic funnel break the Morning Brief flags.
- CVR stable + CTR falling → **creative fatigue** — refresh hooks, not the page.
- Leads up + qualified down → **wrong traffic** — check targeting/angles against personas.
- Everything fine + CPA rising → **auction pressure** — check CPM and impression share.

## Cross-stage attribution

Use `GET /api/v1/clients/{id}/attribution`: compare campaigns on qualified CPL and customer CPA, not just CPL. The campaign with the higher CPL can be the better business.

## Output

A funnel map with the break location, evidence per stage, and the single highest-leverage fix. One fix, not five — funnels break in one place at a time.
