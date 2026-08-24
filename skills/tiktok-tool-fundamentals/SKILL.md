---
name: tiktok-tool-fundamentals
description: "Foundation tool reference for any TikTok Ads task — reporting API usage, TikTok-specific quirks, entity hierarchy, metric definitions, benchmarks. Used internally when working with TikTok tools."
---
# TikTok Ads - Tool Fundamentals

How to use TikTok Ads tools effectively, plus the canonical metric definitions used across all TikTok skills. Auto-loaded with every TikTok skill request.

## Tool Discovery (do this first on any TikTok task)

Tool names below are the canonical names used across this skill pack. Before your first tool call in a session, check the MCP tool list:

- If a canonical name exists verbatim, use it.
- If not, find the closest TikTok tool (`tiktok_get_*`, `tiktok_run_*`) — wrapper names may be suffixed or renamed.
- **Never fabricate a tool call.** If no TikTok tool exists in the MCP tool list, tell the user TikTok access isn't available in this environment and stop.

| Canonical name | Purpose |
|---|---|
| `tiktok_get_ad_account_details` | Account currency, timezone, ID, basic structure — call FIRST on every task |
| `tiktok_run_integrated_report` | Workhorse reporting tool (TikTok integrated report API) |
| `tiktok_get_campaign_details` | Campaign objective, budget mode, status |
| `tiktok_get_adgroup_details` | Ad group: optimization goal, conversion event, targeting, bid strategy, budget |
| `tiktok_get_ad_details` | Ad: creative IDs, formats, Spark Ads identity |
| `tiktok_analyze_ad_creative` | Subjective creative analysis by ad or video URL (mirrors the Meta tool) |

## Entity Hierarchy

```
Advertiser (ad account)
└── Campaign    (objective; budget mode: campaign budget or ad-group budget)
    └── Ad Group  (targeting, optimization goal, bid strategy, budget)
        └── Ad    (creative; multiple creatives if ACO enabled)
```

TikTok calls the targeting/budget unit an **ad group** (not "ad set"). Do not translate Meta terminology into tool calls.

## Report Query Optimization

When using `tiktok_run_integrated_report`:

**Level selection** — use the highest level that answers the question:
- `AUCTION_ADVERTISER` — account totals, overall ROAS
- `AUCTION_CAMPAIGN` — campaign comparison
- `AUCTION_ADGROUP` — targeting/audience performance
- `AUCTION_AD` — creative-level analysis (the default for audits)

**Key parameters**:
- `service_type: "AUCTION"` (standard ads; `RESERVATION` = TopView/brand formats only)
- `report_type: "BASIC"` (or `AUDIENCE` when demographic breakdowns are needed)
- `data_level`: one of the levels above
- `dimensions` / `metrics`: only request what you need (see glossary)

**Field selection — request only what's needed**:
- Basic: `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `cpm`
- With conversions: add `conversion`, `cost_per_conversion`, `conversion_rate`, `total_purchase_value`
- For video: add `video_play_actions`, `video_watched_2s`, `video_watched_6s`, `video_views_p100`

**Default filtering**:
1. Always exclude zero-impression entities: impressions > 0.
2. **Active entity filter (CRITICAL)**: the report returns data for ANY entity with spend in the range, including now-paused/deleted ones. Filter on operating status (canonical TikTok values: `STATUS_ENABLE` vs `STATUS_DISABLE` / `STATUS_DELETE`). Check the MCP tool schema for the exact filter field name (`ad_status` / `adgroup_status` / `campaign_status`) and value format — verify before calling.
3. Only omit the status filter when the user explicitly asks for historical or paused-entity data.

**Default sorting**: spend descending (sort in the tool if supported; otherwise sort locally).

**Pagination (CRITICAL)**: ad-level reports paginate. If the response contains `page_info` (or `has_more` / `next_page`), you MUST fetch ALL remaining pages before analysis. Analyzing page 1 only produces wrong counts, wrong totals, wrong CPAs. Cross-check: if an ad group appears to have only 1 ad, verify there are no more pages.

## Account Context

Always call `tiktok_get_ad_account_details` first. It returns:
- Account currency (for correct monetary display — never assume USD)
- Account timezone (for correct "today"/"yesterday" windows)
- Basic structure of what's running

## Metric Glossary

Canonical definitions used across all TikTok skills. Workflow skills (`performance-analysis`, `creative-analysis`, `depth-of-analysis`, `scaling`) reference these — they do NOT redefine them.

### Direct Metrics (from report response)

| Metric | API Field | Notes |
|---|---|---|
| Spend | `spend` | Direct |
| CPM | `cpm` | Direct |
| CPC | `cpc` | Direct |
| CTR | `ctr` | Direct |
| Impressions | `impressions` | Direct |
| Clicks | `clicks` | Direct |
| Reach | `reach` | Direct |
| Frequency | `frequency` | impressions / reach |
| Conversions | `conversion` | Total conversions (all events) |
| Cost Per Conversion | `cost_per_conversion` | spend / conversion |
| Conversion Rate (CVR) | `conversion_rate` | conversion / clicks |
| Video Plays | `video_play_actions` | Video starts |
| 2-Second Views | `video_watched_2s` | Hook engagement (TikTok's 3s-equivalent) |
| 6-Second Views | `video_watched_6s` | Early hold |
| Completions | `video_views_p100` | 100% quartile views |
| Purchase Value | `total_purchase_value` | Revenue from purchases |
| Value Return | `total_complete_payment_rate` | TikTok's ROAS field: purchase value / spend |

### Calculated Metrics

| Metric | Formula | Notes |
|---|---|---|
| Hook Rate | `video_watched_2s / video_play_actions * 100` | TikTok uses 2s as the hook proxy (not 3s like Meta) |
| Hold Rate | `video_watched_6s / video_watched_2s * 100` | |
| Completion Rate | `video_views_p100 / video_play_actions * 100` | |
| Video View Rate (VVR) | `video_play_actions / impressions * 100` | How often a play starts — the key TikTok creative-health metric |
| ROAS | `total_purchase_value / spend` | Prefer `total_complete_payment_rate` if present. Use ONE — never sum both |
| CPA | `spend / conversion` | Filter to the primary conversion event where possible |
| CVR | `conversion / clicks * 100` | |
| Budget Utilization | `spend / (daily_budget * days_in_period)` | |
| Pareto Set | Sort ads by spend desc; cumulative spend ≤ 90% | These ads drive the majority of activity |

### Video Funnel

```
Video Plays → Hook Rate → 2-Second Views → Hold Rate → 6-Second Views → Completion Rate
```

## Performance Benchmarks

Defaults only — **prefer account-level baselines** (90-day account pull for hook rate / hold rate / VVR / CPA norms). Use these when no baseline is available:

| Metric | Healthy | Average | Poor |
|---|---|---|---|
| Hook Rate (2s) | ≥ 30% | 20–29% | < 20% |
| Hold Rate (6s/2s) | ≥ 50% | 35–49% | < 35% |
| VVR | ≥ 8% | 4–8% | < 4% |
| CTR (feed) | ≥ 1.2% | 0.6–1.2% | < 0.6% |

Do not hard-code CPM/CPA benchmarks — they vary wildly by geo and vertical. Compare against the Pareto average instead.

## TikTok-Specific Quirks

- **Volatility**: TikTok auction results swing day-to-day more than Meta. Use 3-day rolling averages before reacting to any trend. Never act on a single day.
- **Attribution**: default conversion window is 7-day click / 1-day view (account-configurable). Reported conversions follow the account's configured window.
- **Learning phase**: an ad group needs ~50 conversions within 7 days to reach stable delivery. Treat sub-50-conversion ad groups as still learning.
- **Creative lifespan**: TikTok creatives fatigue faster than Meta's — 7–14 days at meaningful spend is common. Monitor VVR at 7-day granularity.
- **Spark Ads**: ads built on organic posts carry their organic engagement (comments/likes/shares) into the ad. Comment sentiment checks matter more here than anywhere else.
- **ACO (Automated Creative Optimization)**: one ad can hold multiple creatives. If creative-level breakdown is available in the report tool, use it; otherwise analyze ACO ads as a bundle and note the limitation.
- **Currency**: TikTok reports in the account currency (not cents — unlike Meta's Marketing API). Verify from account details before presenting money.
