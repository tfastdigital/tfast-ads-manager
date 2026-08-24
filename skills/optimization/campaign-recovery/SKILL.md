---
name: campaign-recovery
description: "Recover a declining campaign — structured recovery playbook from diagnosis through first intervention. Use for 'campaign X is dying, fix it' or recovery sprints."
---
# TFast Campaign Recovery

A declining campaign needs a recovery sequence, not a random set of changes.

## Phase 0 — Stabilize (day 0)

1. Confirm tracking is intact — no recovery is possible on broken data.
2. Check the change log — if something changed 48h ago, that's the prime suspect (revert before inventing new fixes).
3. Stop the bleeding within policy: pause worst ads per the pause matrix (never the top converter).

## Phase 1 — Diagnose (day 0–1)

Run `campaign-diagnosis` fully: creative vs funnel vs audience vs auction vs structure. One diagnosis, written down with the evidence chain.

## Phase 2 — First intervention (day 1)

| Diagnosis | Recovery action |
|---|---|
| Creative fatigue | Refresh 2–3 hooks from the winning pattern; pause Fatigued/Dead variants |
| Funnel break | Fix the landing page (message match, speed, friction) — or pause the group if unfixable |
| Audience saturation | Duplicate with looser targeting; new creative pool for the same audience |
| Auction pressure | Raise bid cap if margin allows; otherwise accept lower volume |
| Structure | Consolidate overlapping groups; extract the winner |

## Phase 3 — Structured test (days 2–14)

Run the recovery as an **experiment** (`POST /api/v1/clients/{id}/experiments`) with the old version as control. Recovery without a control is gambling.

## Phase 4 — Decide

- Recovery working (metrics return within 7 days) → stabilize, then scale per `budget-scaling`.
- Not working after 14 days → the campaign concept is dead; harvest the lesson to memory and move budget (respecting the governor and approval policies).

## Rules

- One intervention at a time, always with a control where possible.
- Document everything — the experiment engine persists the chain (Observation → … → Lesson → Memory) automatically.
- A recovered campaign is fragile: watch it for 7 days before scaling.
