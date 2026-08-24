---
name: client-onboarding
description: "Onboard a new client into the TFast platform — create the client, build the Client Brain sections, register connections, and install the default automation policies. Use for 'add a new client' or 'onboard client X'."
---
# TFast Client Onboarding

Onboard a client end-to-end. The TFast platform API is the system of record.

## Steps

### 1. Create the client
`POST /api/v1/clients` — name, slug, timezone. Roles: admin+.

### 2. Build the Client Brain
Fill every section via `PUT /api/v1/clients/{id}/brain/{section}`. Interview the client before writing — do not invent data.

| Section | Minimum contents |
|---|---|
| `business` | company name, industry, products/services, locations, website, currencies, target markets |
| `brand` | brand description, tone of voice, approved claims, prohibited claims, compliance requirements |
| `customers` | personas, demographics, pain points, desires, objections, buying triggers, customer language, FAQs |
| `economics` | AOV, gross margin, target CPA, target CPL, target ROAS, LTV, daily/monthly budget |
| `advertising_history` | previous campaigns, winning/losing creatives, hooks, offers, audiences, landing pages |
| `competitors` | competitors, their websites, social accounts, offers, market positioning |
| `ai_knowledge` | start empty — it fills from experiments and lessons |

Anything unknown → ask the user. An empty economics section breaks the Budget Governor and the Commander's status classification (they default to ROAS 3 / no CPA target).

### 3. Register connections
`POST /api/v1/clients/{id}/connections` per platform: provider, external_account_id, advertiser_id (TikTok), credential_reference (a server-side secret-store pointer — never the secret itself), permissions (e.g. `["tiktok:read","tiktok:write"]`).

### 4. Install default automation policies
Confirm the client accepts the default set (already seeded for new clients by the platform):

| Action | Mode |
|---|---|
| pause_underperforming_ad | autopilot |
| scale_budget_under_15_percent | autopilot |
| create_new_ad | approval |
| launch_campaign | approval |
| change_budget_over_25_percent | owner_approval |
| change_billing | forbidden |

### 5. Verify
Run a report pull + the Morning Brief for the client. A client is "onboarded" only when its tracking data flows — otherwise it stays a tracking-problem flag.
