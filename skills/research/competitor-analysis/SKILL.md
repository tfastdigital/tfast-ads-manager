---
name: competitor-analysis
description: "Research a client's competitors through the TFast research pipeline — who they are, their offers, their ads and their positioning. Use for 'research our competitors' or competitor deep dives."
---
# TFast Competitor Analysis

Research competitors through the TFast research pipeline (API Direct behind the scenes — TikTok, Instagram, Facebook, Reddit, YouTube, X, LinkedIn, news, forums).

## Workflow

1. `POST /api/v1/clients/{id}/research/run` with:
   - query: competitor names + category keywords ("[competitor] [product] ads")
   - kinds: `["competitor","offer","viral"]`
   - platforms: tiktok, instagram, facebook, youtube
2. Review `GET /api/v1/clients/{id}/research` for stored items.
3. Structure findings per competitor into the `competitors` Client Brain section.

## Analysis frame per competitor

| Dimension | Questions |
|---|---|
| Positioning | What do they claim to be best at? |
| Offers | Discounts, bundles, guarantees, lead magnets |
| Hooks | Their repeatable ad openings (text overlays, questions, claims) |
| Social proof | Follower counts, engagement style, UGC volume |
| Gaps | What they DON'T say — pricing, weaknesses, unanswered objections |

## Rules

- Every claim links to a research item — never fabricate a competitor fact.
- Distinguish observed fact ("they run a 20% first-order offer") from inference ("likely margin pressure").
- Research results stay client-scoped. Never reuse another client's research verbatim; promote only anonymized patterns to Agency Knowledge.
- Store the strongest findings as market_insights automatically (the pipeline does this) and summarize 5–10 insights in your answer.
