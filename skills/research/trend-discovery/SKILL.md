---
name: trend-discovery
description: "Discover emerging trends, viral content formats and trending hooks for a client's market using the TFast research pipeline. Use for 'what's trending' or pre-creative research sprints."
---
# TFast Trend Discovery

Find what's currently winning attention in the client's market.

## Workflow

1. `POST /api/v1/clients/{id}/research/run`:
   - query: client's category + trend terms ("[category] viral", "[category] hook")
   - kinds: `["trend","viral","format"]`
   - platforms: tiktok, youtube, x (short-form trends live on TikTok first)
2. Classify findings by *transferability* to the client:

| Tier | Meaning | Action |
|---|---|---|
| Direct | Same product/category pattern | Brief creative immediately |
| Adjacent | Different category, same mechanism | Adapt the mechanism, not the content |
| Noise | Trend with no mechanism | Ignore |

## What to extract per trend

- The **mechanism** (pattern interrupt, story structure, audio trick) — not the surface content.
- The **hook** — first 2 seconds verbatim where visible.
- **Format** — UGC, skit, text-overlay, before/after.
- **Shelf life** — trends decay fast; prefer evergreen mechanisms with trend flavor.

## Rules

- Distinguish trend from noise: require 3+ independent items before calling something a trend.
- Never recommend copying a competitor's creative wholesale — extract the mechanism, keep the client's brand.
- Store the best trends as market_insights (the pipeline does it automatically).
