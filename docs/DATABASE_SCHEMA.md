# TFast Ads Manager — Database Schema

PostgreSQL + pgvector. Migrations live in `server/src/db/migrations/` (`.pgsql` files, applied in order by `server/src/db/migrate.ts`).

## Conventions

- **IDs**: `uuid` primary keys (gen_random_uuid()).
- **Tenant columns**: every business table carries `agency_id` + `client_id` (nullable `client_id` only for agency-level entities). Compound indexes on `(agency_id, client_id)`.
- **Platform-specific payloads**: `jsonb` (`targeting`, `budget`, `extra`).
- **Append-only logs**: `audit_logs`, `tool_calls`, `agent_runs` — no updates after insert.
- **Row-Level Security**: primary isolation is app-level (tenant middleware). RLS policies are enabled on core tables as defense-in-depth; the pattern is documented below.
- **Embeddings**: `vector(1536)` columns on `memories`, `agency_knowledge`, `research_items` with ivfflat indexes.

---

## Migration Files

| File | Domain |
|---|---|
| `001_core.pgsql` | Agencies, users, membership, clients, connections, ad_accounts |
| `002_ads.pgsql` | Campaigns, ad groups, ads, creatives, creative attributes, audiences, performance snapshots, conversion events |
| `003_ai_memory.pgsql` | Client brains, memories, agency knowledge, research, competitors, experiments, agent runs/decisions/tool calls, approvals, audit logs |
| `004_business.pgsql` | Leads, lead events, customers, purchases, revenue events, attribution |
| `005_policies.pgsql` | Automation policies (modes), budget limits, emergency stops, automation runs |

---

## 001 — Tenancy & Connections

### agencies
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | "TFast Digital Agency" |
| slug | text UNIQUE | |
| status | text | active / suspended |
| created_at, updated_at | timestamptz | |

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | text UNIQUE | login identity |
| name | text | |
| password_hash | text | optional (SSO later) |
| created_at | timestamptz | |

### agency_members
| Column | Type | Notes |
|---|---|---|
| agency_id | uuid FK | |
| user_id | uuid FK | |
| role | text | owner / admin / media_buyer / analyst / viewer |

### clients
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agency_id | uuid FK | tenant root |
| name, slug | text | |
| status | text | onboarded / active / paused / offboarded |
| timezone | text | |

### client_members
| agency_id, client_id, user_id, role | — | per-client roles override agency role |

### connections (Connection Registry — §9)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agency_id, client_id | uuid FK | |
| provider | text | tiktok / meta / google |
| external_account_id | text | platform-side account id |
| advertiser_id | text | TikTok advertiser id (nullable for other platforms) |
| credential_reference | text | **reference to server-side secret store — never the secret itself** |
| permissions | jsonb | granted scopes |
| status | text | pending / active / revoked |
| last_verified_at | timestamptz | |

### ad_accounts
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agency_id, client_id | uuid | |
| connection_id | uuid FK | |
| platform, external_account_id | text | |
| currency, timezone, display_name | text | |

---

## 002 — Advertising Objects & Performance

### campaigns / ad_groups / ads
Common shape per entity:
`id, agency_id, client_id, ad_account_id, platform, external_id (UNIQUE per platform), parent_external_id, name, objective, status, budget jsonb, targeting jsonb (ad_groups), created_at, updated_at`

- `campaigns` — platform campaigns
- `ad_groups` — TikTok ad groups / Meta ad sets / Google ad groups (unified naming: **ad_groups**)
- `ads` — leaf entities

### creatives / creative_variants
- `creatives`: id, agency_id, client_id, platform, external_id, media_type (video/image/carousel), asset_url, duration_seconds, spark_organic (bool), created_at
- `creative_variants`: id, creative_id, variant_label, asset_url, attributes jsonb

### creative_attributes (§11 — Creative Intelligence Memory)
| Column | Type |
|---|---|
| creative_id | uuid FK |
| platform | text |
| format | text — ugc / talking_head / demo / skit … |
| hook | text |
| hook_type | text — contrarian / curiosity / social_proof … |
| presenter_type | text |
| opening_style | text |
| duration_seconds | int |
| problem | text |
| emotions | jsonb[] |
| offer | text |
| cta | text |
| caption_style | text |

Joined with performance to learn which characteristics correlate with results.

### audiences
id, agency_id, client_id, platform, external_id, name, type (broad/interest/lookalike/custom), targeting jsonb, size_estimate int.

### performance_snapshots (unified metric store)
| Column | Type |
|---|---|
| agency_id, client_id | uuid |
| platform | text |
| entity_type | text — account/campaign/ad_group/ad/creative |
| entity_external_id | text |
| stat_date | date |
| spend, impressions, clicks | numeric |
| ctr, cpc, cpm | numeric |
| reach, frequency | numeric |
| conversions, cost_per_conversion, conversion_rate | numeric |
| video_play_actions, video_watched_2s, video_watched_6s, video_views_p100 | numeric |
| total_purchase_value | numeric |
| extra | jsonb — platform-specific fields |

UNIQUE (platform, entity_type, entity_external_id, stat_date). Daily granularity; aggregates computed in queries.

### conversion_events
agency_id, client_id, platform, external_id, event_name, event_time, value, currency, attributed_campaign_id, attributed_ad_id, attribution_window jsonb (e.g. 7d-click/1d-view), raw jsonb.

---

## 003 — AI Memory & Governance

### client_brains (§4 — Client Brain)
`id, agency_id, client_id, section, content jsonb, version, updated_by, updated_at`

Sections: `business, brand, customers, economics, advertising_history, competitors, ai_knowledge`. Loaded automatically before any recommendation/decision for that client.

### memories (client + agency memory — §21)
| Column | Type | Notes |
|---|---|---|
| agency_id | uuid | |
| client_id | uuid NULL | NULL ⇒ agency-level knowledge |
| scope | text | client / agency |
| kind | text | fact / observation / hypothesis / lesson |
| content | text | |
| embedding | vector(1536) | semantic recall |
| importance | smallint | 1–10 |
| is_anonymized | bool | required true for agency-scope entries derived from client data |

### agency_knowledge (§21)
`id, agency_id, topic, pattern jsonb (generalized), evidence jsonb (anonymized, no client identifiers), embedding vector(1536), confidence numeric, created_at`

### observations / hypotheses / experiments / lessons (§12)
- `observations`: client, entity refs, metric, delta, window
- `hypotheses`: observation_id FK, statement, rationale
- `experiments`: hypothesis_id FK, design jsonb (variants, success criteria), status (planned/running/completed), start/end, result jsonb
- `lessons`: experiment_id FK, content, confidence, promoted_to_memory bool

### competitors / research_items / market_insights (§8, API Direct)
- `competitors`: name, website, socials jsonb, notes
- `research_items`: source (apidirect), platform (tiktok/instagram/reddit/youtube/x/linkedin/web/forum), kind (competitor/viral/trend/complaint/question/language/offer/influencer/format/sentiment), content jsonb, embedding vector(1536), collected_at
- `market_insights`: client_id, research_item_id NULL, insight text, category, confidence

### agent_runs / agent_decisions / tool_calls (§26)
- `agent_runs`: agent, model, input jsonb, output jsonb, status, token_usage jsonb, timestamps
- `agent_decisions`: agent_run_id FK, decision, reason, confidence, alternatives jsonb
- `tool_calls`: agent_run_id, tool, proposed_parameters jsonb, mode (dry_run/execute), policy_result jsonb, approval_status, execution_result jsonb, before_state jsonb, after_state jsonb, idempotency_key, created_at

### approvals (§13)
`id, agency_id, client_id, tool_call_id FK, action_type, requested_by, status (pending/approved/rejected/expired), required_role, decided_by, decided_at, reason`

### audit_logs (§26 — the complete immutable record)
```
agent, model, agency_id, client_id, account_id, campaign_id,
input jsonb, reason text, decision text, tool text,
proposed_parameters jsonb, policy_result jsonb, approval_status text,
execution_result jsonb, before_state jsonb, after_state jsonb, timestamp
```
Answers: *"Why did TFast AI pause this advertisement?"*

---

## 004 — Business Outcomes (§19, §20)

### leads
`id, agency_id, client_id, external_id, source (campaign/ad/platform), contact jsonb, stage (lead → qualified_lead → appointment → show → customer), created_at, qualified_at, converted_at`

### lead_events
`id, lead_id, event (created/qualified/appointment/showed/purchased/refunded), amount, occurred_at` — the journey trace.

### customers
`id, lead_id, first_purchase_at, ltv numeric`

### purchases
`id, agency_id, client_id, customer_id, lead_id, order jsonb, revenue numeric, costs jsonb (cogs, payment_fees, shipping, discounts, sales_commissions), refunds numeric, occurred_at`

### revenue_events
`id, agency_id, client_id, source (crm/ecommerce/booking/payments), external_id, type (purchase/refund), amount, currency, fee jsonb, occurred_at, customer_id`

### attribution
`id, event_id (conversion or revenue), campaign_id, ad_id, platform, model (last_click/view_through/first_touch), credit numeric` — enables "Campaign B with 2× CPL but 7× qualified leads" reasoning (§19) and contribution profit (§20).

---

## 005 — Policies & Budgets (§13, §14)

### automation_policies (per-client action modes)
`id, agency_id, client_id, action_type, mode, min_approval_role, updated_at`

Action types include: `pause_underperforming_ad`, `scale_budget_under_15_percent`, `create_new_ad`, `launch_campaign`, `change_budget_over_25_percent`, `change_billing`…

Modes: `advisory | approval | autopilot | owner_approval | forbidden` (example mapping from §13).

### budget_limits (Budget Governor inputs)
`id, agency_id, client_id, ad_account_id NULL, scope (account/campaign), kind (daily_max / monthly_max / auto_scale_max_increase / auto_scale_max_decrease / max_new_campaigns_per_day), value jsonb`

### emergency_stops
`id, agency_id, client_id, ad_account_id NULL, active bool, reason, activated_by, activated_at, deactivated_at` — hard kill switch evaluated in code.

### automation_runs (Morning Brief & pipeline jobs)
`id, agency_id, client_id NULL (agency-wide briefs), rule_name, trigger jsonb, findings jsonb, severity, status, created_at`

---

## RLS Pattern (defense-in-depth)

```sql
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_scope ON clients
  USING (agency_id = current_setting('app.agency_id')::uuid);

-- child tables additionally:
-- USING (client_id = current_setting('app.client_id')::uuid
--        AND agency_id = current_setting('app.agency_id')::uuid);
```

The app sets `app.agency_id` / `app.client_id` per transaction from the authenticated session. App-level tenant middleware is the primary control; RLS guarantees a bug cannot read across tenants.
