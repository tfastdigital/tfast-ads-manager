/**
 * Budget Governor (§14) — DETERMINISTIC financial safety.
 *
 * LLMs must never have unrestricted authority over advertising spend.
 * This module executes in application code. It has no LLM call path
 * and no override. If the governor says no, the operation stops.
 */
import { z } from 'zod';

export interface ClientBudgetLimits {
  daily_max?: number;                    // max daily account spend
  monthly_max?: number;                  // monthly budget
  auto_scale_max_increase_pct?: number;  // max automatic budget increase (e.g. 30)
  auto_scale_max_decrease_pct?: number;  // max automatic budget decrease
  max_new_campaigns_per_day?: number;
}

export interface BudgetChangeProposal {
  client_id: string;
  ad_account_id?: string;
  campaign_id?: string;
  kind: 'budget_increase' | 'budget_decrease' | 'new_campaign' | 'new_ad_group';
  current_budget?: number;
  proposed_budget?: number;
  currency: string;
  /** spend so far in the current windows (from snapshots) */
  spent_today: number;
  spent_month: number;
  new_campaigns_today: number;
  emergency_stop_active: boolean;
  limits: ClientBudgetLimits;
}

export const BudgetDecisionSchema = z.object({
  allowed: z.boolean(),
  requires_approval: z.boolean(),
  reason: z.string(),
  limit_evidence: z.record(z.string(), z.union([z.number(), z.string()])),
});

export type BudgetDecision = z.infer<typeof BudgetDecisionSchema>;

/** Deterministic evaluation. Pure function — no I/O, no model. */
export function evaluateBudgetChange(p: BudgetChangeProposal): BudgetDecision {
  const evidence: BudgetDecision['limit_evidence'] = {};

  // 1. Emergency stop always wins.
  if (p.emergency_stop_active) {
    return {
      allowed: false,
      requires_approval: false,
      reason: 'EMERGENCY_STOP_ACTIVE — all spend-affecting operations are blocked.',
      limit_evidence: { emergency_stop: 1 },
    };
  }

  // 2. New campaign/day cap.
  if (p.kind === 'new_campaign' && p.limits.max_new_campaigns_per_day != null) {
    evidence.max_new_campaigns_per_day = p.new_campaigns_today;
    if (p.new_campaigns_today >= p.limits.max_new_campaigns_per_day) {
      return {
        allowed: false,
        requires_approval: true,
        reason: `New-campaign cap reached: ${p.new_campaigns_today}/${p.limits.max_new_campaigns_per_day} today.`,
        limit_evidence: evidence,
      };
    }
  }

  // 3. Daily / monthly spend ceilings (hard deny — not approval-able by media buyers).
  if (p.kind !== 'budget_decrease') {
    if (p.limits.daily_max != null && p.spent_today >= p.limits.daily_max) {
      return {
        allowed: false,
        requires_approval: false,
        reason: `Daily spend cap reached (${p.spent_today} >= ${p.limits.daily_max}).`,
        limit_evidence: { daily_max: p.limits.daily_max, spent_today: p.spent_today },
      };
    }
    if (p.limits.monthly_max != null && p.spent_month >= p.limits.monthly_max) {
      return {
        allowed: false,
        requires_approval: false,
        reason: `Monthly budget exhausted (${p.spent_month} >= ${p.limits.monthly_max}).`,
        limit_evidence: { monthly_max: p.limits.monthly_max, spent_month: p.spent_month },
      };
    }
  }

  // 4. Auto-scale step limits — §14: IF proposed_budget_change > client.auto_scale_limit THEN require approval.
  if (p.kind === 'budget_increase' && p.current_budget != null && p.proposed_budget != null) {
    const pct = ((p.proposed_budget - p.current_budget) / p.current_budget) * 100;
    const cap = p.limits.auto_scale_max_increase_pct ?? 0;
    evidence.auto_scale_max_increase_pct = cap;
    evidence.proposed_increase_pct = Math.round(pct * 100) / 100;
    if (pct > cap) {
      return {
        allowed: true,
        requires_approval: true,
        reason: `Proposed +${pct.toFixed(1)}% exceeds the auto-scale cap of +${cap}%. Human approval required.`,
        limit_evidence: evidence,
      };
    }
  }

  if (p.kind === 'budget_decrease' && p.current_budget != null && p.proposed_budget != null) {
    const pct = ((p.current_budget - p.proposed_budget) / p.current_budget) * 100;
    const cap = p.limits.auto_scale_max_decrease_pct ?? 100;
    evidence.auto_scale_max_decrease_pct = cap;
    evidence.proposed_decrease_pct = Math.round(pct * 100) / 100;
    if (pct > cap) {
      return {
        allowed: true,
        requires_approval: true,
        reason: `Proposed −${pct.toFixed(1)}% exceeds the auto-scale decrease cap of −${cap}%. Human approval required.`,
        limit_evidence: evidence,
      };
    }
  }

  return {
    allowed: true,
    requires_approval: false,
    reason: 'All budget limits satisfied.',
    limit_evidence: evidence,
  };
}
