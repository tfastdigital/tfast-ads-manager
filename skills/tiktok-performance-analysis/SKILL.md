---
name: tiktok-performance-analysis
description: "Use when analyzing TikTok ad performance: objective/PCM detection, Pareto analysis, baselines, performance thresholds, issue diagnosis, recommendations."
---
# TikTok Ads - Performance Analysis Workflow

> Metric definitions (CPM, CPA, ROAS, VVR, Hook/Hold Rate, benchmarks, Pareto definition) live in `tiktok/tool-fundamentals` and auto-load with this skill. Do NOT redefine them here. This skill is the workflow for performance audits after the metrics are loaded.

## Step 1: Identify Objective & Primary Conversion Metric (PCM)

Read the ad group's `optimization_goal` and conversion event — from the API, never from names:

- `tiktok_get_adgroup_details` → returns optimization goal (e.g. CONVERSION, CLICK, REACH, VIDEO_VIEW) and conversion event (e.g. COMPLETE_PAYMENT, ADD_TO_CART, SUBSCRIBE).
- `tiktok_get_campaign_details` → campaign objective for context.

PCM mapping:

| Optimization Goal | PCM | Evaluate on |
|---|---|---|
| CONVERSION → Complete Payment | ROAS / CPA (purchase) | Revenue, AOV, cost per purchase |
| CONVERSION → other event | CPR (cost per result) | Cost per `<event>` |
| CLICK (traffic) | CPC / CTR | Landing-page economics |
| VIDEO_VIEW | Cost per 6s view | Hook rate, cost per completion |
| REACH | CPM, frequency | Cost per reach |

***PROHIBITED***: Never extract or infer objectives from campaign/ad names. Names frequently don't match actual config.

**Mixed accounts**: group ad groups by their conversion event. Each group gets its own PCM. Do not mix conversion types.

**If conversion event data is missing**: ASK the user which event is the business outcome.

## Step 2: Pareto Pull (90% Spend)

1. Pull ad-level report data sorted by spend descending.
2. Compute cumulative spend share; keep ads where cumulative ≤ 90% — these are the Pareto ads.
3. Focus all further analysis on Pareto ads.

**Query for Pareto ads** (MUST include active status filter):

```
Tool: tiktok_run_integrated_report
service_type: "AUCTION"
report_type: "BASIC"
data_level: "AUCTION_AD"
dimensions: ["ad_id", "ad_name", "adgroup_id"]
metrics: ["spend", "impressions", "cpm", "ctr", "clicks", "conversion", "cost_per_conversion", "total_purchase_value", "video_play_actions", "video_watched_2s", "video_watched_6s"]
date range: last_30d
filtering: impressions > 0 AND ad_status IN [STATUS_ENABLE]
sort: spend desc
```

**CRITICAL**: Always include the operating-status filter. Without it the API returns data for paused/deleted entities with historical spend. Fetch ALL pages before analyzing (see `tool-fundamentals → Pagination`).

## Step 3: Establish Baselines

From the Pareto set, compute:
- `avg_cpm` = mean CPM across Pareto ads
- `avg_ctr` = mean CTR across Pareto ads
- `avg_vvr` = mean VVR across Pareto video ads
- `avg_pcm` = mean ROAS (e-commerce) or mean CPR/CPA (lead gen / custom)

These are the comparison points for individual-ad assessment. Apply variance thresholds from `tool-fundamentals → Performance Benchmarks`.

## Step 4: Diagnose Issues

**High CPM + Low PCM**:
- Expensive audience, not converting
- Action: pause ad or test different targeting / broaden audience

**Low VVR + Low CTR + Low PCM**:
- Creative isn't stopping the scroll or the message isn't resonating
- Check comments for negative sentiment — especially on Spark Ads, where organic engagement travels with the ad
- If comments fine: test new hooks/creative variations

**Good metrics but declining trend**:
- Check frequency + VVR trend — see fatigue signal in `tool-fundamentals → TikTok-Specific Quirks`
- TikTok creatives fatigue fast: if VVR is decaying 7+ days while frequency rises, it's creative fatigue, not audience exhaustion
- Action: new creative variations, not just budget changes

**CPA strong but volume tiny**:
- Check ad group reach trend — the audience pool may be too narrow (common with stacked interest targeting)
- Action: broaden targeting or duplicate with a looser audience before scaling budget

## Step 5: Generate Recommendations

**MANDATORY**: After completing the analysis, generate specific, actionable recommendations for each Pareto ad and for the account overall.

### Per-Ad Recommendations
For each Pareto ad, based on its diagnostic profile:
- **What to do**: specific action (pause, scale, create variation, change targeting)
- **Why**: metrics-based justification (e.g., "CPM 40% above Pareto avg with 0.3× ROAS")
- **How**: concrete next steps

### Account-Level Recommendations
Summarize the top 3–5 strategic recommendations:
1. Budget reallocation (shift spend from poor → good performers; respect `tiktok-guardrails`)
2. Creative strategy (what's working, what to test next — hooks, formats, Spark Ads)
3. Targeting adjustments (if CPM issues are widespread — often over-narrow targeting on TikTok)
4. Structure changes (ad group consolidation if fragmented)

### Output Format

```markdown
## Performance Summary

| Ad | Format | Spend | CPM | CTR | VVR | ROAS/CPA | Status |
|----|--------|-------|-----|-----|-----|----------|--------|
| [Name] | Video | $X | $X | X% | X% | X | [Scale/Pause/Test] |

**Benchmarks (Pareto avg)**: CPM: $X | CTR: X% | VVR: X% | ROAS: X

## Recommendations

### Per-Ad Actions
1. **[Ad Name]**: [Action] — [Justification]
2. **[Ad Name]**: [Action] — [Justification]

### Strategic Recommendations
1. [Actionable recommendation with metrics basis]
2. [Actionable recommendation with metrics basis]
3. [Actionable recommendation with metrics basis]
```

**If creative analysis is needed** (hook rates, VVR decay, Spark Ads engagement): use the `tiktok-creative-analysis` skill.
