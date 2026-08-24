---
name: creative-analysis
description: "Cross-platform creative diagnostics — evaluate a client's creatives with the TFast creative intelligence layer and platform skills. Use for 'analyze our creatives' or creative deep dives."
---
# TFast Creative Analysis

Evaluate creatives with structured intelligence, not vibes.

## Workflow

1. **Extract attributes** — `POST /api/v1/clients/{id}/creative/analyze` with creative asset URLs (multimodal extraction into `creative_attributes`).
2. **Correlate with performance** — `GET /api/v1/clients/{id}/creative/intelligence?days=30` returns ROAS/CPA per attribute value (hook_type, format, CTA, offer, presenter).
3. **Platform metrics** — delegate to the platform skills for the platform-specific funnel:
   - TikTok: hook rate (2s), hold rate (6s), VVR → `tiktok-creative-analysis`
   - Meta: hook (3s), hold (15s/thruplay), CTR → `meta-creative-analysis`

## Diagnostic scenarios (platform-agnostic)

| Profile | Root cause | Fix |
|---|---|---|
| Good hook, poor hold | Message loses people after the open | Rebuild the middle: value prop earlier, pattern breaks |
| Poor hook | Nobody stops scrolling | Rebuild the first 2–3 seconds from winning hooks |
| Good hook + hold, poor CTR | People watch but don't click | Strengthen CTA / landing-page promise alignment |
| Everything good, declining | Fatigue | Refresh variants from the winning pattern |

## Pattern extraction

From the correlation output, list the winning pattern: best hook_type + format + CTA + offer combination and its ROAS. That combination IS the creative brief for the next batch.

## Rules

- Never judge a creative on spend alone — always attribute-performance pairs.
- Keep the client's best patterns in `ai_knowledge` brain section and as memory (`POST /api/v1/clients/{id}/creative/remember-patterns`).
