---
name: tiktok-creative-fatigue-detection
description: |
  Per-ad creative fatigue diagnosis on TikTok Ads. Scores every active ad as Healthy / Early Warning / Fatigued / Dead using VVR decline, hook-rate decay, frequency creep, CPA spike, and spend-shift signals. Surfaces specific refresh recommendations: which variants to retire, which winners to remix, which hooks to test next. Read-only — no pauses applied. Use weekly or before any creative refresh cycle.
argument-hint: "[Advertiser ID] [optional: lookback window in days, default 14]"
---

# TikTok Creative Fatigue Detection (Read-Only)

Diagnose creative fatigue across TikTok advertiser `$ARGUMENTS`. Default lookback: 14 days. **Read-only — never pauses or modifies ads.**

## Fatigue scoring signals

Score each active ad on:

| Signal | Healthy | Early Warning | Fatigued | Dead |
|---|---|---|---|---|
| **VVR decline** vs first-week-of-life | < 10% drop | 10–25% drop | 25–50% drop | > 50% drop |
| **Hook-rate decline** (2s views %) vs first week | < 10% drop | 10–25% drop | 25–50% drop | > 50% drop |
| **Frequency** | < 3 | 3 – 4 | 4 – 6 | > 6 |
| **CPA spike** vs ad-group median | < 10% above | 10–25% above | 25–50% above | > 50% above |
| **Spend shift** | Stable or rising | Flatlined | Declining | Reaching cliff |

Final classification = worst signal score across all five dimensions.

Note: TikTok fatigues faster than Meta. A 14-day window is the right granularity — a 30-day window hides fatigue that already happened.

## Output

### Section 1 — Fatigue summary table

| Ad name | Score | VVR drop | Hook drop | Freq | CPA delta | Days live |

Sort: most fatigued first. Cap at top 20.

### Section 2 — Per-ad recommendations

For each `Fatigued` or `Dead` ad, one line:
- `🪦 [Ad name] — Dead. Recommendation: retire. The hook is exhausted; do not relaunch as-is.`
- `🔻 [Ad name] — Fatigued. Recommendation: pause this variant; the underlying concept is still winning, remix the hook.`
- `⚠️  [Ad name] — Early Warning. Watch — likely needs a refresh in 7–14 days (sooner than Meta would).`

For each `Healthy` or `Early Warning` winning ad with strong CPA/ROAS:
- `[Ad name] — Healthy winner. Recommendation: extract the pattern, brief 2–3 variants on the same concept.`

For Spark Ads specifically, add the organic-engagement check:
- `🔍 [Ad name] — Spark Ad: organic post X days old, engagement [rising/decaying].`

### Section 3 — Creative refresh brief

3–5 bullet points on what hooks/formats/angles deserve fresh creative based on patterns in the Fatigued + Healthy-winner cohorts. TikTok-native: UGC style, trend audio, text-overlay hooks.

End with: `_All recommendations — no changes applied. Ask explicitly to pause anything._`
