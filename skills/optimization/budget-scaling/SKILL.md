---
name: budget-scaling
description: "Scale budgets safely for a TFast client — when, by how much, and when to stop. Works inside the deterministic Budget Governor. Use for 'what can we scale' or scaling decisions."
---
# TFast Budget Scaling

Scaling is a sequence of safe steps, not a bet. The Budget Governor (deterministic, in platform code) enforces the hard limits; this skill encodes the discipline around them.

## Prerequisites (ALL required)

- Profitable for 14–30 consecutive days (ROAS ≥ target / CPA ≤ target per objective).
- Trends stable or improving WoW (3-day rolling averages — TikTok is volatile).
- Not dominated by warm/retargeting pockets (≥ 80% warm = retargeting, different playbook).

## Step size

- **+20–30% per step**, no more than one step per 24–48h.
- After each step: watch CPA/ROAS for 3 days before the next.
- Stop triggers: CPA > 1.2× target OR ROAS < 0.8× target → pause scaling, diagnose, reassess after 14 days.
- Hard cap: 2–3× initial budget only after 90+ days of consistent profitability.

## Where scaling lives

Scaling happens at **campaign or ad group level only** — never ad-level budgets (TikTok has none; Meta/Google ads inherit from parents). All mutations go through the platform gateways (`/tiktok/mutation`, `/meta/mutation`, `/google/mutation`) which run dry-run → approval → governor → execute. Autopilot covers ≤ 15% steps per the default policy; bigger steps require approval by design.

## Non-budget scaling (often better)

- **Audience expansion**: broaden targeting / outward lookalikes before raising budget.
- **Creative volume**: a fresh creative scales better than a 30% budget bump on a fatiguing ad — more budget makes a bad creative louder.
- **Structure**: extract an ACO winner to a standalone ad for dedicated delivery.

## Output

Per candidate: entity, current budget, proposed step, expected impact, review window, and the stop trigger. Every recommendation framed as risk + review + cap.
