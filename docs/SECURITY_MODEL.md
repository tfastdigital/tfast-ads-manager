# TFast Ads Manager — Security Model

Security is a first-class requirement. The design principle: **the LLM is an untrusted recommendation engine; all authority lives in deterministic code.**

## 1. Threat Model

| Threat | Control |
|---|---|
| Cross-client data leakage (bug or malicious prompt) | Tenant middleware + scoped queries + RLS defense-in-depth; gateway refuses scope-less tool calls |
| LLM overspends | Budget Governor in code; emergency stop |
| Unauthorized mutation | Approval Engine modes + RBAC |
| Credential theft from frontend | Secrets server-side only; frontend never receives keys |
| Credential theft from repo | `.env` gitignored; credential_reference indirection in DB |
| Prompt injection | Tool calls validated against typed schemas; no free-form tool selection; allow-listed operations |
| Non-repudiation gaps | Append-only audit logs |
| Replay/duplicate mutations | Idempotency keys on every write |
| Abuse / rate spikes | Rate limits per tenant + per user; MCP permission scoping |

## 2. Tenant Isolation

1. Auth token → session → `agency_id` + role (server-side, never from client input).
2. Every request carries a resolved `TenantScope { agency_id, client_id? }`.
3. Data-access layer appends `WHERE agency_id = $1 [AND client_id = $2]` — enforced by query-builder, not convention.
4. Row-Level Security enabled on core tables; `app.agency_id` / `app.client_id` set per transaction.
5. Tool Gateway resolves `client_id → connection → advertiser_id` itself; agents cannot supply account IDs arbitrarily.

Isolation tests are mandatory in CI.

## 3. RBAC

| Role | Portfolio view | Client view | Recommendations | Approve actions | Manage policies | Billing |
|---|---|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ (owner-level) | ✅ | ✅ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| media_buyer | ✅ | ✅ | ✅ | ✅ (their clients) | ❌ | ❌ |
| analyst | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| viewer | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

Client-level roles (`client_members`) narrow agency roles further. Approval requirements use `min_approval_role` per action type.

## 4. Secrets Management

- All provider keys (OpenAI, DeepSeek, API Direct), DB URL, MCP tokens: `.env` (gitignored) or a server-side secret store in production.
- `connections.credential_reference` stores a **reference** to the secret store, never the secret.
- Frontend (web/) is credential-free; it calls the server API only.
- Keys are never logged: audit/redaction middleware strips `Authorization` and known key patterns.

## 5. Tool Permissions & MCP Controls

- The Tool Gateway exposes an **allow-list** of operations per platform, mapped to action types.
- TikTok MCP tokens are server-side; the gateway enforces: tenant scope → permission check → dry-run (writes) → approval → budget check → execute → audit.
- Rate limits per (tenant, provider) with exponential backoff and retry budgets.

## 6. Budget Governor — Deterministic

Evaluated in `server/src/core/budget-governor.ts` before every spend-affecting operation:

- maximum daily account spend
- maximum campaign budget
- maximum automatic budget increase
- maximum automatic budget decrease
- maximum new campaigns per day
- monthly budget
- emergency stop
- account-level and campaign-level limits

```text
IF proposed_budget_change > client.auto_scale_limit THEN require approval
```

Governor returns `{ allowed, requires_approval, reason, limit_evidence }`. If the Governor says no, the operation stops — no LLM override path exists.

## 7. Dry-Run System

Every write-capable advertising tool supports `DRY RUN` before `EXECUTE`. A dry run returns:

```
proposed_action, current_state, proposed_state, expected_reason,
affected_client, affected_account, affected_campaign,
financial_impact, policy_evaluation, approval_requirement
```

Execution proceeds only when policies permit and (in approval/autopilot mismatch cases) a human approves.

## 8. Approval Modes

Per client, per action type: `advisory | approval | autopilot | owner_approval | forbidden`.

Example policy set:

| Action | Mode |
|---|---|
| pause_underperforming_ad | autopilot |
| scale_budget_under_15_percent | autopilot |
| create_new_ad | approval |
| launch_campaign | approval |
| change_budget_over_25_percent | owner_approval |
| change_billing | forbidden |

Approvals expire; expired approvals never auto-execute.

## 9. Auditability

Every AI action records: `agent, model, agency_id, client_id, account_id, campaign_id, input, reason, decision, tool, proposed_parameters, policy_result, approval_status, execution_result, before_state, after_state, timestamp`.

A human can ask *"Why did TFast AI pause this advertisement?"* and receive the full evidence chain from `audit_logs` + linked `agent_decisions` + `tool_calls`.

## 10. Session & Input Controls

- Session controls: short-lived tokens, refresh rotation, server-side revocation.
- Rate limits per user and per tenant (API + AI provider calls).
- All external API data validated against zod schemas before use.
- Writes idempotent via idempotency keys.
