---
name: tiktok-depth-of-analysis
description: "Use for any TikTok Ads audit, performance review, optimization request, strategy question, or funnel analysis. Covers 8 analytical dimensions: hierarchical drill-down, breakdowns, temporal trends, attribution rigor."
---
# TikTok Ads - Depth of Analysis

> **When to apply**: Audits, performance reviews, optimization requests, strategy questions, funnel analysis.
> **Skip for**: Simple data fetches, campaign listings, metric lookups.

## 1. Hierarchical Drill-Down

Never make recommendations based solely on campaign-level or ad-group-level aggregates. Before concluding on any entity, drill one level deeper.

**Required flow:**
- Asked about a campaign → check ad group performance within it
- Asked about an ad group → check individual ad performance within it
- Asked about ads → check creative-level patterns (same creative across multiple ads, ACO bundles)

**How:**
```
tiktok_run_integrated_report at data_level="AUCTION_ADGROUP" with campaign filter
tiktok_run_integrated_report at data_level="AUCTION_AD" with adgroup filter
```

Identify which specific child entities are driving or dragging the parent's aggregate numbers. Quantify the contribution (e.g., "Ad Group X accounts for 72% of campaign spend but only 40% of conversions").

## 2. Objective-Contextual Evaluation

Do not apply universal KPIs. Evaluate each ad group against its actual optimization goal.

**Check first:**
- `optimization_goal` + conversion event from `tiktok_get_adgroup_details`
- Campaign objective from `tiktok_get_campaign_details`
- Bid strategy (Lowest Cost, Cost Cap, Target Cost, Minimum ROAS)

**Apply correct KPIs:**

| Objective | Evaluate on | NOT on |
|-----------|------------|--------|
| CONVERSION → Complete Payment | ROAS, CPA, revenue | Reach, VVR alone |
| CONVERSION → other event | Cost per result, volume | ROAS |
| CLICK (traffic) | CPC, CTR, landing-page metrics | Conversions |
| VIDEO_VIEW | Cost per 6s view, hook rate | ROAS, CPA |
| REACH | CPM, reach, frequency | CPA, ROAS |

**Flag bid strategy issues**: If a Cost Cap is set 3× above actual CPA, or a Minimum ROAS floor is 0.5× while achieving 3× — the constraint isn't binding. Call this out.

## 3. Breakdown & Segmentation Analysis

When this skill applies (audits, performance reviews, optimization), check at least 2 breakdown dimensions. Deep analysis requires segmentation.

**Required breakdowns:**
```
tiktok_run_integrated_report with report_type="AUDIENCE" (age/gender dimensions)
tiktok_run_integrated_report with device / region dimensions
```

**What to look for:**
- Placement differences (TikTok vs Pangle vs app networks) — quantify the gap
- Device divergence (iOS vs Android — iOS is usually cheaper and higher-converting on TikTok)
- Age/gender segments consuming budget outside target
- Out-of-target segments eating budget with poor conversion rates

**Statistical significance check**: Do not make segment-level recommendations from <100 impressions or <3 conversions in a segment. Call out low-confidence segments explicitly.

## 4. Temporal & Trend Analysis

Never treat a date range as a single static number. Always compare time windows.

**Required comparisons:**
```
tiktok_run_integrated_report with stat_time_day dimension (daily data)
```

Analyze at minimum:
- Last 7 days vs previous 7 days
- Direction for each key metric: improving, declining, or stable
- Flag inflection points: "VVR started declining on [date], 3 days before CPA started rising"

**Connect the chain**: Frequency rising → VVR falling → CTR falling → CPA rising → this is creative fatigue, not audience exhaustion. Correlate timing across metrics to establish cause, not just observe symptoms.

**Volatility rule**: TikTok swings more day-to-day than Meta. Use 3-day rolling averages for trend judgments. A single bad day is noise; 3 consecutive bad days is a signal.

## 5. Cross-Entity Dependency Mapping

Do not analyze campaigns in isolation. Map the funnel.

**Check:**
- Which campaigns/ad groups are prospecting (broad or lookalike targeting)?
- Which are retargeting (custom audiences, website/app visitors)?
- Does cutting a prospecting ad group starve the retargeting pool?
- Are there Spark Ads driving organic engagement that feeds organic loops (a TikTok-specific flywheel)?

**How to detect:**
- `tiktok_get_adgroup_details` → check `audience_type` / targeting for custom audiences vs broad
- Prospecting: low frequency, broader audience, lower CTR
- Retargeting: higher frequency, higher CTR, smaller audience

**Flag dependencies**: "Pausing Ad Group X will reduce the Website Visitors 7d pool feeding Ad Group Y's retargeting. Expect retargeting CPA to rise within 1–2 weeks."

## 6. Platform Mechanic Awareness

Explain how TikTok's mechanics affect the situation — the compound interaction, not just a mention.

| Signal | Mechanic | Consequence |
|--------|----------|-------------|
| Rising frequency + falling VVR | Creative fatigue | CPA will spike — need new creatives, not budget changes |
| One ad getting dominant delivery in an ad group | TikTok's optimization | Usually working as intended — the algorithm concentrates budget on the best converter. Don't pause the dominant ad just because siblings look better on small samples |
| Cost Cap + rising CPM | Delivery squeeze or audience shift | Separate the causes: (a) algorithm can't find results at the cap (raise cap or loosen targeting); (b) audience saturated, delivery leaking to worse segments. Check frequency + reach trend |
| New ad group with low spend | Learning phase | Don't judge until the ad group has accumulated ~50 conversions in 7 days or spent 2× AOV / 4× CPA — whichever is higher |
| Smart+ campaign (Smart Performance Campaign) | Automated everything | Targeting/placement controls are limited by design. Trust delivery but watch creative quality — creative is the only lever you fully control |
| Spark Ads with decaying organic engagement | Social proof decay | The borrowed engagement that made them cheap is aging out; refresh with a new organic post |

## 7. Proactive Signal Detection

After answering the user's question, always surface 2–3 additional concerns or opportunities they did not ask about.

**Scan for:**
- Any ad with frequency > 3 and VVR declining 7+ days — creative fatigue incoming
- Any ad group spending > 30% of campaign budget with 0 conversions — budget waste
- Any top ad with declining VVR/CTR over 7+ days — performance degradation ahead
- Any retargeting audience pool shrinking (declining reach week over week)
- Any Spark Ad whose organic post is > 90 days old
- Any metric that looks fine now but the trend predicts problems in 7–14 days

**Format:** "Outside your question, I noticed [signal] in [entity] — this suggests [predicted consequence] within [timeframe]."

## 8. Attribution Rigor

Do not take reported conversion numbers at face value.

**Always check:**
- What conversion window is active? (TikTok default: 7-day click / 1-day view)
- What share of conversions are view-through vs click-through?
- Is reported ROAS inflated by view-through on high-impression campaigns?
- iOS ATT impact: TikTok loses signal on opted-out iOS users — expect under-reporting, not over-reporting, there

**Flag these situations:**
- Retargeting with very high ROAS + mostly view-through → likely over-attributed
- Two ad groups targeting the same audience → conversions may be double-counted
- TikTok Pixel + GA4 both reporting "their" conversions — reconcile before trusting either (see `ga4-source-of-truth`)

**Frame as caveat:** "Before scaling Ad Group X on its reported 4× ROAS, note that [specific attribution concern] means the true incremental ROAS is likely lower."
