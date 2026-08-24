---
name: conversion-analysis
description: "Reconcile platform-reported conversions with business reality — dedupe, attribution windows, and the gap between what platforms claim and what the CRM shows. Use before trusting any ROAS/CPA number."
---
# TFast Conversion Analysis

Never trust platform conversions at face value (see the depth-of-analysis discipline).

## Check list

1. **Attribution window** — what window is active (TikTok default 7d click / 1d view)? Conversions follow the account's configured window.
2. **View-through share** — high-impression retargeting with mostly view-through conversions is over-attributed. Ask for click vs view split before scaling on that ROAS.
3. **Double counting** — two campaigns/ad groups targeting the same audience → same conversion claimed twice. Compare per-campaign totals against account totals.
4. **Platform vs CRM gap** — reconcile platform conversions against `revenue_events`/`leads` in TFast. A 30%+ gap is a tracking problem, not a performance insight.
5. **iOS/ATT** — TikTok and Meta under-report opted-out iOS users; the true numbers are usually BETTER than reported on iOS-heavy accounts (opposite of view-through inflation).

## The disciplined reading

Report ROAS as a range, not a point: "reported 4×, but with 40% view-through share and 15% CRM gap, true incremental is likely 2.5–3×." Then decide — never scale on the raw number.

## Sources

- Platform reports through the gateways (`/tiktok/report`, `/meta/report`, `/google/report`).
- TFast business endpoints: `GET /api/v1/clients/{id}/attribution` (lead-level), `revenue_events` via `POST /api/v1/clients/{id}/revenue` ingestion.
- GA4 for cross-checking — see the `ga4-source-of-truth` skill for channel-subset traps.

## Output

Per campaign: reported ROAS/CPA, attribution caveats, reconciled range, and the verdict: trust / verify / don't-trust.
