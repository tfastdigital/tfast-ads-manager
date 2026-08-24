---
name: tiktok-guardrails
description: "Guardrails for TikTok Ads recommendations and mutations. Hard rules on what NOT to recommend, prohibited phrasing, data-quality requirements. Used internally for any TikTok optimization or change."
---
# TikTok Ads Guardrails

**READ BEFORE GENERATING ANY RECOMMENDATION.**

## Budget Reallocation Prohibition

You CANNOT allocate, shift, increase, reduce, or scale budget for: ads (only campaigns and ad groups have budgets on TikTok), placements (TikTok controls distribution), demographics (age, gender, location breakdowns), audience segments.

**Before writing ANY recommendation, ask:** Does it imply moving money between ads, placements, demographics, or segments? If YES → rewrite using valid controls below.

## Valid Budget Controls

1. Campaign budget (with or without Campaign Budget Optimization) or ad group budget
2. Bid caps / cost caps / Minimum ROAS floors
3. Turning ads/ad groups on or off

If a recommendation does not map to one of these three controls, it is not actionable.

## Mandatory Rewrites

❌ "Reallocate $X from [ad A] to [ad B]"
✅ "Pause [ad A]. Increase campaign/ad group budget by 15–20% to give [ad B] more spend opportunity."

❌ "Allocate more to [placement/age/segment]"
✅ "Create a new ad group targeting [dimension] with its own budget, OR exclude underperforming [dimension] via ad group placement/targeting settings."

**Rule**: Breakdowns (age, gender, placement, device, region) show how TikTok distributed YOUR budget. They are not levers you control. The only way to influence them is new ad groups with specific targeting/placement selections.

## Metric Selection by Conversion Type

- **Ecommerce** (Complete Payment): Use ROAS, revenue, AOV, cost per purchase. Never use ROAS for lead gen.
- **Lead gen** (form submits, leads): Use CPL / cost per qualified lead. Never use ROAS unless offline revenue is mapped.
- **App** (installs, in-app events): Use CPI, cost per activation. Never use ROAS unless in-app revenue tracking is confirmed.
- **Unclear**: Ask user. Do not assume.

## STOP Rules

**PRE-CHECK**: Can I point to the exact TikTok Ads Manager UI field? If no → do not recommend.

- No ad-level budget moves (TikTok has no ad-level budgets)
- No demographic or placement budget allocation
- No frequency caps for conversion objectives (frequency control only exists for Reach campaigns on TikTok)
- No scaling individual ads (only campaign/ad group level)
- No scaling > 20–30% in one step, and no more than one step per 24–48h
- Do not pause ads or ad groups younger than 7 days without enough signals
- Do not increase budget on entities below ROAS/CPL/CPA targets — diagnose first
- Do not call something scalable with < 10% revenue share of total account or statistically weak conversion volume
- Minimum signals: 3–5 conversions per ad group per week before performance judgments; remember TikTok learning = ~50 conversions / 7 days
- Do not rely on first 24–48 hours of data as reliable — on TikTok, extend this to 3 days (use 3-day rolling averages)

## Top Performer Protection (CRITICAL)

**NEVER recommend pausing the top-converting ad in an ad group.** If TikTok's algorithm concentrates delivery on one ad and that ad produces the majority of conversions, that is optimization working correctly — not a problem.

**Pause decision matrix**:

| Condition | Action |
|-----------|--------|
| Ad has highest conversion volume in ad group | **KEEP** — regardless of delivery share |
| Ad has 0 conversions AND spend > 2× ad group CPA target | PAUSE |
| Ad has conversions but CPA > 3× ad group average AND 3+ conversions (statistically significant) | PAUSE |
| Ad has 1–2 conversions with high CPA | WATCH — insufficient data |
| Ad is < 7 days old | WATCH — let it exit learning |

**Self-check before any pause recommendation**: "Am I about to pause the ad that drives the most conversions in this ad group?" If yes → DO NOT PAUSE. Recommend testing new creatives alongside it.

## Spark Ads Protection

**Never recommend pausing a top-converting Spark Ad solely because its organic post is old or its CPM is lower than siblings** — low CPM is a feature, not a bug. Only pause a Spark Ad on performance grounds (CPA/ROAS), same matrix as above.

## Methodology Consistency

Once you establish a methodology for evaluating ad performance in a conversation, do NOT change it unless the user explicitly asks. Changing criteria mid-analysis destroys trust. If your methodology was wrong, say so clearly, explain what you're changing and why, then apply the new methodology consistently from that point forward.

## Required Diagnostics Before Action

Before any scale/pause/duplicate/structural suggestion:
1. Audience composition: prospecting vs retargeting mix
2. Delivery metrics: CPM, CTR, VVR, Reach, Frequency (with spend context)
   - High frequency alone ≠ fatigue
   - Frequency rising + VVR falling over 7–14 days = creative fatigue
3. Engagement relevance: offer-aligned comments vs spam/backlash (Spark Ads especially)
4. Attribution window: 7d-click/1d-view default; view-through share
5. Confirm results not dominated by warm/small pools before scaling

## Scaling Guardrails

- Only campaign or ad group budget fields
- Max increase: 20–30% at once, one step per 24–48h
- Require before scaling: performance target hit, ad group revenue share ≥ 10% of account, not dominated by 80%+ warm/retargeting pocket
- If data is noisy or contradictory → say **insufficient data**, shift to structured testing
- All scaling must include: deterioration risk warning + review window + spend cap

## Recommendation Workflow

1. Fetch setup first (`tiktok_get_campaign_details` + `tiktok_get_adgroup_details`): targeting, budget type, optimization goal, bid strategy, learning status
2. Self-check: breakdown-based budget move detected? → STOP. Can state exact Ads Manager field? → continue
3. Validate: breakdown insight from broad audience → cannot scale that slice; can recommend new ad groups or creative angles
4. Placement: never budget moves between placements; suggest exclusions via new/duplicated ad group
5. Learning phase: avoid resets unless required
6. Risk framing: all scaling includes risk warning + review window + cap
