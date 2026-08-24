---
name: profit-analysis
description: "Optimize toward contribution profit — revenue minus COGS, fees, shipping, discounts, commissions, refunds and ad spend — using the TFast profit layer. Use when margins matter more than revenue."
---
# TFast Profit Analysis

The final optimization objective (§20): contribution profit, not revenue, not even ROAS.

## The formula

```
Contribution Profit =
  Revenue
  − COGS / cost of services
  − payment fees
  − shipping
  − discounts
  − refunds
  − sales commissions
  − advertising spend
```

TFast computes it per campaign: `GET /api/v1/clients/{id}/profit?days=30` (purchases carry a costs breakdown).

## Why profit-first

- A campaign at 4× ROAS can lose money if margins are 15% and the platform counts gross order value.
- A campaign at 2× ROAS can be the profit engine if AOV/margin are strong.
- Discount-driven campaigns look great on revenue and terrible on contribution.

## Reading the report

| Pattern | Meaning |
|---|---|
| High revenue, negative contribution | Discounts/fees eating the margin — reprice or kill |
| Strong contribution on one campaign | Double down there, not on raw-ROAS winners |
| Contribution declining while ROAS stable | Cost-side creep (shipping, fees) — fix ops, not ads |

## Client objectives (§20)

The client chooses the objective: Leads → Qualified Leads → Bookings → Purchases → Revenue → ROAS → Contribution Profit. Store it in the `economics` brain section (`optimization_objective`). Every recommendation must evaluate against THAT objective — a ROAS recommendation for a contribution-profit client is wrong by construction.

## Output

Per campaign: revenue, costs breakdown, ad spend, contribution profit, margin %, and verdict (scale / fix economics / kill).
