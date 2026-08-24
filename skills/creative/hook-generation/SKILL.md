---
name: hook-generation
description: "Generate ad hooks from a client's winning patterns, research language and persona objections. Use for 'write us hooks' or creative production sprints."
---
# TFast Hook Generation

Hooks are the highest-leverage line of copy. Generate them from data, not imagination.

## Inputs

1. Winning patterns: `GET /api/v1/clients/{id}/creative/intelligence` (best hook_type + top hooks).
2. Customer language: the phrase bank in the `customers` brain section (verbatim complaints, questions, slang).
3. Offer: current lead offer + risk reversal from `economics`/`advertising_history`.

## Hook types (rotate deliberately)

| Type | Structure | Works when |
|---|---|---|
| Contrarian | "Stop [common advice]. Do [opposite]." | Category has stale advice |
| Problem | "If [pain], [offer]." | Pain is acute + frequent |
| Curiosity | "Nobody tells you [secret]." | Information asymmetry |
| Social proof | "[N] people [result]." | Credible numbers exist |
| Question | "Why does [product] [surprising fact]?" | Surprising product truth |
| Trend | Ride a current format/audio | Fast decay — pair with evergreen |

## Formula

```
Hook = audience word + problem/desire + pattern interrupt
```

First 2 seconds: visual + text overlay + spoken line must all land. Test 3 hooks per concept, not 1.

## Output

10–15 hooks per brief, each tagged: type, persona, objection it answers, and the verbatim audience phrase it's built from. Flag the 3 strongest for first production.

## Rules

- Every hook must trace to a brain/research fact — no invented statistics, no fake scarcity.
- Mark hooks that need approval claims (compliance) per the `brand` brain section.
