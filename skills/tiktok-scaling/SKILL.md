---
name: tiktok-scaling
description: "Use when scaling TikTok campaigns and ad groups: budget scaling rules, pause triggers, audience expansion, creative refresh cadence. Loads performance-analysis first."
---
# TikTok Ads — Scaling & Expansion

Rules for scaling TikTok ad groups/campaigns that have passed evaluation. Only load after confirming profitability via `tiktok-performance-analysis`.

## Scaling Prerequisites

ALL must be true before scaling:
- Ad group profitable for 14–30 consecutive days
- ROAS ≥ target (or CPA ≤ target — per the objective, see `tiktok-guardrails`)
- Performance trends stable or improving WoW (use 3-day rolling averages — TikTok is volatile)
- Not dominated by warm/retargeting pockets (≥ 80% warm = retargeting scaling, different playbook)

---

## Budget Scaling

**Increase budget by 20–30% per step, no more than one step per 24–48 hours.**

| Scenario | Action |
|----------|--------|
| Profitable 14+ days, trends stable | Increase 20–30% |
| Post-scaling CPA > 1.2× target | PAUSE scaling, optimize creative/targeting, reassess after 14 days |
| Post-scaling ROAS < 0.8× target | PAUSE scaling, optimize, reassess after 14 days |
| Consistently profitable 90+ days | Can exceed 2–3× initial budget |

**Hard cap**: Do not exceed 2–3× initial budget until 90+ days of consistent profitability.

**Review window**: After each increase, watch CPA/ROAS for 3 days (with rolling averages) before the next step. Any step that trips a pause trigger → stop scaling.

---

## Audience Expansion

TikTok rewards broad targeting. The standard scaling path is broadening, not narrowing:

1. Start broad from the beginning where possible (TikTok's own guidance: avoid stacking interest targeting)
2. If a winning ad group has narrow targeting (interests + lookalikes stacked): duplicate with looser targeting and same creative, give it its own budget
3. Lookalikes: scale lookalike percentages outward (1% → 3% → 5%) only after the tighter pool is profitable
4. Do NOT force audience preferences without data

---

## Creative Refresh Cadence

TikTok creatives fatigue fast — budget scaling without a creative pipeline is the #1 scaling killer.

- Refresh hooks every 1–2 weeks on heavy-spending ads (see `tiktok-creative-analysis`)
- Before a big budget step (≥ +30%), ensure a fresh creative is in the ad group or ready to add
- Scaling a fatiguing creative accelerates its death — more budget makes the problem louder, not better
- Spark Ads: if organic engagement is decaying, prepare a new organic post to boost

---

## Structure Rules

- Scale at the ad group or campaign level, NEVER at the ad level (TikTok has no ad-level budget)
- Winning creative inside an ACO bundle → extract to a standalone ad for dedicated delivery
- Multiple winning ad groups → consider CBO at campaign level and let TikTok allocate

## Prohibitions

- Never scale before 14 days of profitability
- Never increase budget > 30% in one step
- Never scale beyond 2–3× initial budget before 90 days profitable
- Never continue scaling if CPA > 1.2× target OR ROAS < 0.8× target
- Never scale a fatiguing creative without a refresh in flight
- Never scale past the account's post-ATT signal reality (iOS under-reporting makes true CPA worse than reported — pad targets)
