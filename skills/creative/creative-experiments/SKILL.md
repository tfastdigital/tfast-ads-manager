---
name: creative-experiments
description: "Design and run creative experiments through the TFast experiment engine — the Observation→Diagnosis→Hypothesis→Experiment→Result→Lesson→Memory chain. Use for 'test these hooks' or structured creative testing."
---
# TFast Creative Experiments

Structure creative testing through the TFast experiment engine (§12).

## The chain (every hop persisted)

```
Observation → Diagnosis → Hypothesis → Experiment → Result → Lesson → Memory
```

Create experiments via `POST /api/v1/clients/{id}/experiments`:

```json
{
  "observation": "CTR declined 32%.",
  "diagnosis": "Possible creative fatigue.",
  "hypothesis": "Changing the opening three seconds while retaining audience and offer will improve CTR.",
  "title": "Hook refresh test",
  "variants": [
    {"name": "control", "ad_external_id": "old_ad_id"},
    {"name": "hook_B", "ad_external_id": "new_ad_id"}
  ],
  "success_criteria": ["CTR ≥ +20% vs control", "CPA ≤ control"],
  "duration_days": 14
}
```

Evaluate with `POST /api/v1/clients/{id}/experiments/{experiment_id}/evaluate` — deterministic: variant metrics come from snapshots; winner = best ROAS among variants with minimum signals (spend > 0 and ≥ 1 conversion). Lessons are written automatically and promoted to client memory.

## Experiment design rules

1. **One variable** — hook, angle, CTA, or format. Never change two things at once.
2. **Control included** — a "no change" variant makes the result interpretable.
3. **Minimum signals** — a variant is ineligible below 1 conversion; prefer ≥ 3–5 before declaring winners.
4. **Full window** — evaluate after the duration_days has elapsed; early evaluation biases toward spend-time winners.
5. **Budget Governor applies** — experiments spend real money; the design must fit the client's limits.

## After the result

- Winner → brief variants on the winning pattern (see `creative-fatigue` cadence).
- Loser → the lesson row records why; the pattern goes to `ai_knowledge` brain section.
- Inconclusive → extend or kill; never "almost significant" your way into a decision.
