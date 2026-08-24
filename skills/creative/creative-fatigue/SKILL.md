---
name: creative-fatigue
description: "Detect creative fatigue across a client's platforms and produce a refresh plan. Combines the TFast fatigue detectors with the platform-level fatigue commands. Use weekly or when performance decays."
---
# TFast Creative Fatigue Detection

Fatigue = the audience has seen it. The signal is the same everywhere: **attention metrics decay while frequency rises**.

## Signals (platform-adapted)

| Platform | Attention metric | Fatigue threshold |
|---|---|---|
| TikTok | VVR (plays ÷ impressions) + 2s hook rate | ↓ ≥ 25% with frequency ≥ 3 |
| Meta | 3s hook rate + CTR | ↓ ≥ 25% with frequency > 3.5 |
| Google (display/video) | CTR + view rate | ↓ ≥ 25% over 14d |

Platform specifics: `/tiktok-creative-fatigue-detection` and `/meta-creative-fatigue-detection` commands score every active ad (Healthy / Early Warning / Fatigued / Dead). The TFast Morning Brief adds portfolio-level fatigue findings.

## Refresh plan

For each Fatigued/Dead ad, decide:

| Score | Action |
|---|---|
| Dead | Retire. Do not relaunch as-is. |
| Fatigued | Pause variant; remix the hook — the concept still works. |
| Early Warning | Brief 2–3 variants on the same concept now. |
| Healthy winner | Extract the pattern, produce variants BEFORE fatigue hits. |

## Cadence rules

- TikTok: refresh hooks every 1–2 weeks on heavy spenders.
- Meta: every 2–4 weeks depending on frequency growth.
- A creative pipeline that only reacts to fatigue is always late — recommend the next batch the moment a winner is declared.

Output: fatigue table + per-ad action + a refresh brief (hooks/formats/angles from the winning pattern).
