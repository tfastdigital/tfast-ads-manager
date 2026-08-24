/**
 * Policy service — reads automation_policies, budget_limits and
 * emergency_stops for the deterministic safety pipeline (§13, §14).
 * Defaults are conservative: unknown action type ⇒ approval; unknown
 * budget cap ⇒ 0% auto-scale (everything requires approval).
 */
import { pool } from '../db/pool.js';
import { assertClientScoped, type TenantScope } from '../core/tenant.js';
import type { AutomationMode } from '../core/approvals.js';
import type { ClientBudgetLimits } from '../core/budget-governor.js';

export interface SpendWindows {
  spent_today: number;
  spent_month: number;
  new_campaigns_today: number;
}

export async function getAutomationMode(scope: TenantScope, actionType: string): Promise<AutomationMode> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ mode: AutomationMode }>(
    `SELECT mode FROM automation_policies
     WHERE agency_id = $1 AND client_id = $2 AND action_type = $3`,
    [scope.agency_id, scope.client_id, actionType],
  );
  return rows[0]?.mode ?? 'approval'; // conservative default
}

export async function getMinApprovalRole(scope: TenantScope, actionType: string): Promise<string> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ min_approval_role: string }>(
    `SELECT min_approval_role FROM automation_policies
     WHERE agency_id = $1 AND client_id = $2 AND action_type = $3`,
    [scope.agency_id, scope.client_id, actionType],
  );
  return rows[0]?.min_approval_role ?? 'media_buyer';
}

export async function getBudgetLimits(scope: TenantScope, adAccountId?: string): Promise<ClientBudgetLimits> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ kind: string; value: { amount?: number; percent?: number; count?: number } }>(
    `SELECT kind, value FROM budget_limits
     WHERE agency_id = $1 AND client_id = $2 AND (ad_account_id = $3 OR ad_account_id IS NULL)`,
    [scope.agency_id, scope.client_id, adAccountId ?? null],
  );
  const limits: ClientBudgetLimits = {};
  for (const row of rows) {
    switch (row.kind) {
      case 'daily_max':
        if (row.value.amount != null) limits.daily_max = row.value.amount;
        break;
      case 'monthly_max':
        if (row.value.amount != null) limits.monthly_max = row.value.amount;
        break;
      case 'auto_scale_max_increase':
        if (row.value.percent != null) limits.auto_scale_max_increase_pct = row.value.percent;
        break;
      case 'auto_scale_max_decrease':
        if (row.value.percent != null) limits.auto_scale_max_decrease_pct = row.value.percent;
        break;
      case 'max_new_campaigns_per_day':
        if (row.value.count != null) limits.max_new_campaigns_per_day = row.value.count;
        break;
    }
  }
  return limits;
}

export async function getSpendWindows(scope: TenantScope, adAccountId?: string): Promise<SpendWindows> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ spent_today: number; spent_month: number }>(
    `SELECT COALESCE(SUM(spend) FILTER (WHERE stat_date = current_date), 0)::float8 AS spent_today,
            COALESCE(SUM(spend) FILTER (WHERE stat_date >= date_trunc('month', current_date)), 0)::float8 AS spent_month
     FROM performance_snapshots
     WHERE agency_id = $1 AND client_id = $2 AND entity_type = 'account'`,
    [scope.agency_id, scope.client_id],
  );
  void adAccountId;
  const { rows: campRows } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM campaigns
     WHERE agency_id = $1 AND client_id = $2 AND created_at::date = current_date`,
    [scope.agency_id, scope.client_id],
  );
  return {
    spent_today: Number(rows[0]?.spent_today ?? 0),
    spent_month: Number(rows[0]?.spent_month ?? 0),
    new_campaigns_today: campRows[0]?.count ?? 0,
  };
}

export async function isEmergencyStopped(scope: TenantScope, adAccountId?: string): Promise<boolean> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ active: boolean }>(
    `SELECT active FROM emergency_stops
     WHERE agency_id = $1 AND client_id = $2
       AND (ad_account_id = $3 OR ad_account_id IS NULL)
       AND active = true
     LIMIT 1`,
    [scope.agency_id, scope.client_id, adAccountId ?? null],
  );
  return rows.length > 0;
}
