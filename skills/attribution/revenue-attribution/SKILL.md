---
name: revenue-attribution
description: "Attribute actual revenue (purchases, refunds, bookings) to campaigns and reconcile with platform-reported values. Use when optimizing toward real money rather than platform revenue."
---
# TFast Revenue Attribution

Platforms report their own version of revenue. TFast reports the money that actually landed.

## Data flow

1. Revenue ingested via `POST /api/v1/clients/{id}/revenue` (source: crm/ecommerce/booking/payments; type: purchase/refund).
2. Purchases linked through leads: `POST /api/v1/clients/{id}/leads/{id}/events` with `purchased` + amount.
3. Report: `GET /api/v1/clients/{id}/attribution` — per-campaign revenue through lead paths.

## Reconciliations to run

| Check | Why |
|---|---|
| Platform revenue vs TFast revenue events | Platform counts order value incl. things that get refunded |
| Refund rate per campaign | A campaign with 20% refunds is 20% worse than its ROAS claims |
| AOV per campaign | ROAS can rise while AOV falls — margin erosion hides there |
| Timing lag | Revenue lands days after the click; 7d windows understate young campaigns |

## The refund discipline

Refunds reduce *real* ROAS after the fact. If refunds are tracked per campaign, correct ROAS: `(revenue − refunds) / spend`. If refunds aren't tracked, flag it — every ROAS number is then optimistic by the refund rate.

## Output

Per campaign: platform revenue, tracked revenue, refunds, corrected ROAS, and the verdict: scale / hold / investigate.
