---
name: offer-research
description: "Research competitor offers, pricing and incentives in a client's market via the TFast research pipeline, and shape the client's own offer strategy. Use for 'what offers are working' or offer-mapping projects."
---
# TFast Offer Research

Map the offer landscape and shape the client's offer strategy.

## Workflow

1. `POST /api/v1/clients/{id}/research/run`:
   - query: competitor names + offer terms ("discount", "free shipping", "trial", "guarantee")
   - kinds: `["offer","competitor"]`
   - platforms: web, tiktok, facebook, instagram
2. Build an offer map:

| Competitor | Lead offer | Price point | Risk reversal | Mechanism |
|---|---|---|---|---|
| … | 20% first order | $49 | 30-day guarantee | Discount |
| … | Free consultation | — | — | Lead magnet |

## Offer mechanics to watch for

- **Risk reversal**: guarantees, free returns, trials — the strongest conversion levers.
- **Framing**: "first order 20% off" vs "$10 off" vs "free gift" — same cost, different conversion.
- **Bundles**: what do they attach to raise AOV.
- **Urgency**: countdowns, limited stock — note which are real vs evergreen.

## Output

1. Offer map table.
2. 3–5 offer options for the client, each with: mechanism, economics check (against Client Brain `economics` — margin, AOV), and expected objection it answers.
3. Update the `competitors` and `economics` brain sections with findings.

## Rules

- An offer that violates the client's margin is not an offer — check economics first.
- Prefer the client's own risk-reversal over copying a competitor's exact numbers.
