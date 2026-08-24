---
name: offer-strategy
description: "Shape a client's offer and positioning — lead offer, risk reversal, pricing framing — grounded in economics and competitor research. Use for offer design, promotion planning, or 'why isn't our offer converting'."
---
# TFast Offer Strategy

Design the offer stack. Inputs: Client Brain `economics` (margin, AOV, LTV) and `competitors`, plus the offer research findings.

## The offer stack

1. **Lead offer** — the lowest-friction entry ("20% off first order", "free consultation", "starter kit"). Must be profitable or have known LTV payback.
2. **Risk reversal** — guarantee, free returns, trial. The single highest-leverage addition for cold traffic.
3. **Value framing** — same discount, better frame ("$10 off" → "Free express shipping" → "Free gift worth $25").
4. **Upsell path** — bundles/attachments that raise AOV toward LTV.

## Economics gate (mandatory)

For every offer option, compute against the brain's economics:

```
contribution = price − cogs − fees − shipping − discount
allowed discount ≤ gross_margin − target_ad_cost_share
```

If the numbers don't clear, the offer doesn't ship — no exceptions. The Budget Governor guards spend; this skill guards the margin side.

## Positioning

One line: "For [persona], [client] is the [category] that [differentiator]." Differentiator comes from competitor gaps (what competitors don't say) and customer language (what customers actually care about).

## Output

Offer options table (mechanism, economics check, objection answered) + positioning line + recommended risk reversal. Store winners in the `economics` and `advertising_history` brain sections.
