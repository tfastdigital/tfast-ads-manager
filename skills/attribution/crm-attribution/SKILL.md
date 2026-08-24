---
name: crm-attribution
description: "Attribute leads, qualified leads and customers to campaigns via the TFast business layer — and judge campaigns by quality of outcome, not cost of lead. Use for CRM-connected optimization."
---
# TFast CRM Attribution

Optimize against business outcomes, not platform conversions (§19).

## Data flow

1. Leads ingested via `POST /api/v1/clients/{id}/leads` (with `campaign_external_id`) or CRM sync.
2. Stage transitions via `POST /api/v1/clients/{id}/leads/{leadId}/events`: `created → qualified → appointment → showed → purchased`.
3. Report: `GET /api/v1/clients/{id}/attribution?days=30` — per campaign: leads, qualified, appointments, customers, CPL, qualified CPL, customer CPA.

## The core insight

Compare campaigns on **qualified CPL and customer CPA**, not raw CPL:

```
Campaign A: 50 leads, CPL $3,  2 qualified, 1 customer  → qualified CPL $75
Campaign B: 20 leads, CPL $6, 14 qualified, 8 customers → qualified CPL $9
```

Campaign B is ~8× more valuable per qualified lead. Cutting B for its higher CPL is the classic mistake this skill prevents.

## Rules

- Lead volume without qualification is a vanity metric — always pair CPL with qualified CPL.
- Stage data must come from the CRM, never estimated. If qualification isn't tracked, say so and recommend wiring it before optimizing on it.
- Customer CPA vs LTV (from the `economics` brain section) is the final arbiter: a $75 customer on $300 LTV is fine; on $60 LTV it's fatal.

## Output

Campaign table with CPL / qualified CPL / customer CPA + verdict per campaign (scale / keep / fix targeting / fix sales handoff).
