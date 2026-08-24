---
name: audience-language
description: "Extract the exact language a client's audience uses — complaints, questions, desires, objections — from social data via the TFast research pipeline. Use before writing any ad copy or hooks."
---
# TFast Audience Language

People buy with their own words, not the brand's. Collect those words.

## Workflow

1. `POST /api/v1/clients/{id}/research/run`:
   - query: category + product + pain terms
   - kinds: `["complaint","question","language"]`
   - platforms: reddit, x, tiktok, forums, youtube (comments are gold)
2. Bucket the language:

| Bucket | Example signals | Use for |
|---|---|---|
| Complaints | "broke after a week", "too expensive" | Objection handling in hooks |
| Questions | "does it work with X?", "how long…" | FAQ + ad copy answers |
| Desires | "I wish it had…" | Benefit claims |
| Objections | "scam?", "worth it?" | Trust builders, guarantees |
| Slang | the audience's own words | Literal copy — write it back to them |

## Output

A phrase bank: verbatim audience phrases mapped to hooks, objections, and FAQs. Update the `customers` Client Brain section (`PUT /api/v1/clients/{id}/brain/customers`) with `customer_language` so every future creative brief inherits it.

## Rules

- Quote verbatim — paraphrase loses the voice. Mark verbatim vs paraphrased.
- Prefer real complaints over polished reviews; complaints reveal buying triggers.
- Never invent a quote. If the pipeline returns nothing, say so.
