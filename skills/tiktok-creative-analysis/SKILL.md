---
name: tiktok-creative-analysis
description: "Use when analyzing TikTok ad creatives: video hook/hold/VVR diagnostics, Spark Ads engagement, ACO bundles, creative pattern recognition."
---
# TikTok Ads - Creative Analysis Workflow

> Metric definitions (Hook Rate, Hold Rate, VVR, video funnel, benchmarks) live in `tiktok/tool-fundamentals` and auto-load with this skill. Do NOT redefine them here. This skill is the workflow for diagnosing creative performance after the metrics are loaded.

## Inputs You Need

Before applying this skill, ensure you have:
- Ad-level video metrics (`video_play_actions`, `video_watched_2s`, `video_watched_6s`, `video_views_p100`) — see `tool-fundamentals` for exact fields and formulas.
- Account-level Hook/Hold/VVR baselines from a 90-day account pull.
- Pareto set of ads (cumulative spend ≤ 90%).

## TikTok Creative Reality Check

TikTok is a video-first platform. Image ads exist but underperform except in a few verticals — treat any image ad in the Pareto set as an anomaly worth investigating. Native-feel, UGC-style creative beats polished production in most auctions. Spark Ads (boosted organic posts) carry organic engagement — likes/comments/shares — into the ad unit, and comment sentiment is a direct diagnostic signal.

## Diagnostic Scenarios for Video Ads

Apply the benchmarks from `tool-fundamentals` (Hook / Hold / VVR / CTR thresholds) to classify each Pareto video ad.

### Scenario 1: Good Hook, Poor Hold
- Hook Rate Good (≥ 30%), Hold Rate Poor (< account avg), VVR Average
- **Root cause**: Hook stops the scroll, but content loses interest after 2 seconds.
- **Fix**: Keep the hook. Rebuild seconds 2+: move the value prop earlier, show product sooner, add pattern breaks, tighten pacing.

### Scenario 2: Average Everything
- Hook Rate Average (20–29%), Hold Rate ≈ Avg, VVR Average
- **Root cause**: Nothing stands out. Room for improvement everywhere.
- **Fix**: Priority 1 — improve the hook first (if they don't stop, nothing else matters). Use `tiktok_analyze_ad_creative` to assess the visual hook. Then tighten the middle.

### Scenario 3: Poor Hook
- Hook Rate Poor (< 20%), Hold any, VVR any
- **Root cause**: People aren't stopping to watch.
- **Fix**: Rebuild the hook completely. Compare to hooks in top-performing ads. Test variations: different visual opening, text overlay in the first 0.5s, audio hook, problem vs benefit statement, trend alignment.

### Scenario 4: Great Hook + Hold, Poor CTR
- Hook Good, Hold > Acct Avg + 25%, CTR Poor (< 0.6%)
- **Root cause**: People watch the whole video but don't click. CTA weak or the landing-page promise is unclear.
- **Fix**: Check comments for negative sentiment first (Spark Ads especially). If fine — strengthen the CTA: more prominent visual, clearer verbal call-out, urgency/scarcity, better landing-page alignment.

## Spark Ads Analysis

For ads with Spark Ads identity (boosted organic posts):
- Pull engagement: comments, likes, shares that came with the organic post.
- Read the actual comments. Negative sentiment on a Spark Ad is more damaging than on a standard ad — it's visible social proof.
- Healthy signal: high positive comments + high Hook Rate → strong scaling candidate (Spark Ads often get CPM discounts).
- Watch: Spark Ads whose organic post is older than ~90 days — borrowed momentum decays.

## ACO (Automated Creative Optimization) Ads

- One ACO ad holds multiple creatives; ad-level metrics bundle them.
- If the report tool supports creative-level breakdown (`group_by` on creative/item id), use it to split the bundle. If not, analyze the bundle and state the limitation explicitly.
- A winning pattern inside an ACO bundle → extract it into a standalone ad so it can get dedicated budget.

## Pattern Recognition Across Top Ads

Among top Pareto ads, analyze each with `tiktok_analyze_ad_creative` to identify:
- Common hook patterns (what stops the scroll — text overlay, question, trend audio, shock visual)
- Common format patterns (talking-head UGC, product demo, before/after, story skit, trend)
- Common angles (which selling points repeat across winners)
- Native vs polished: which style wins in this account

Use winning patterns to guide new creative variations.

## Variation Strategy

**When an ad performs well**: Copy variations (same angle, different wording) → Angle variations (different selling point) → Hook variations (rebuild the first 2 seconds) → Format variations (same message, new format).

**When an ad performs poorly**:

| Issue | Action |
|-------|--------|
| Hook Rate poor | Rebuild hook using winning hooks |
| Hook good, Hold poor | Rebuild middle section (pacing, pattern breaks) |
| Hook good, Hold good, CTR poor | Strengthen CTA |
| All metrics poor | Test completely new approach |

**Cadence**: TikTok creatives fatigue fast. A healthy account refreshes hooks every 1–2 weeks on heavy-spending ads. If the account has no creative pipeline, say so — that's the #1 growth blocker.
