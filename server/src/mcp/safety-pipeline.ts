/**
 * Shared safety pipeline (§13–15, §26) — platform-agnostic.
 * Every write-capable advertising operation on ANY platform flows through:
 *   dry-run → approval → budget governor → execute → audit
 * Platform adapters (tiktok / meta / google) resolve context and provide
 * the executor; THIS module owns all policy decisions. The LLM has no
 * bypass path.
 */
import { z } from 'zod';
import type { TenantScope } from '../core/tenant.js';
import { evaluateBudgetChange, type BudgetChangeProposal } from '../core/budget-governor.js';
import { buildDryRunResult, type DryRunResult } from '../core/dry-run.js';
import { evaluateApproval } from '../core/approvals.js';
import { appendAuditLog, redactSecrets } from '../core/audit.js';
import { pool } from '../db/pool.js';
import {
  getAutomationMode, getMinApprovalRole, getBudgetLimits,
  getSpendWindows, isEmergencyStopped,
} from '../services/policies.js';

export type PlatformId = 'tiktok' | 'meta' | 'google';

export interface SafetyPipelineRequest {
  scope: TenantScope & { client_id: string; ad_account_id: string };
  platform: PlatformId;
  connection_id: string;
  account_external_id: string;
  permissions: string[];
  operation: string;                 // platform operation, e.g. "campaign.update"
  actionType: string;                // automation_policies action_type (§13)
  params: Record<string, unknown>;
  beforeState: Record<string, unknown>;
  budget: {
    kind?: BudgetChangeProposal['kind'];
    current?: number;
    proposed?: number;
    currency: string;
    deltaPerDay?: number;
    description: string;
  } | null;
  executor: () => Promise<unknown>;  // actual platform call (adapter-provided)
  idempotencyKey?: string;
}

export interface MutationOutcome {
  ok: boolean;
  executed: boolean;
  dry_run?: DryRunResult;
  error?: string;
  tool_call_id: string;
  approval?: { id: string; status: 'pending' | 'blocked'; required_role: string };
  execution_result?: unknown;
  message: string;
}

export async function runSafetyPipeline(req: SafetyPipelineRequest): Promise<MutationOutcome> {
  const scope = req.scope;
  const required = req.operation.includes('report') || req.operation.includes('.get') ? 'read' : 'write';
  if (required === 'write' && !req.permissions.includes(`${req.platform}:write`)) {
    return {
      ok: false, executed: false, tool_call_id: '',
      error: `PERMISSION_DENIED: missing ${req.platform}:write`,
      message: 'Permission denied.',
    };
  }

  const [mode, minRole, limits, spend, stopped] = await Promise.all([
    getAutomationMode(scope, req.actionType),
    getMinApprovalRole(scope, req.actionType),
    getBudgetLimits(scope, scope.ad_account_id),
    getSpendWindows(scope, scope.ad_account_id),
    isEmergencyStopped(scope, scope.ad_account_id),
  ]);

  // ── Budget Governor (deterministic) ──
  const budgetKind: BudgetChangeProposal['kind'] = req.budget
    ? req.budget.kind ??
      (req.budget.current != null && req.budget.proposed != null
        ? req.budget.proposed >= req.budget.current
          ? 'budget_increase'
          : 'budget_decrease'
        : req.budget.proposed != null
          ? 'budget_increase'
          : 'new_campaign')
    : 'new_campaign';
  const proposal: BudgetChangeProposal = {
    client_id: scope.client_id,
    ad_account_id: scope.ad_account_id,
    kind: budgetKind,
    current_budget: req.budget?.current,
    proposed_budget: req.budget?.proposed,
    currency: req.budget?.currency ?? 'USD',
    spent_today: spend.spent_today,
    spent_month: spend.spent_month,
    new_campaigns_today: spend.new_campaigns_today,
    emergency_stop_active: stopped,
    limits,
  };
  const budgetDecision = evaluateBudgetChange(proposal);

  const dryRun = buildDryRunResult({
    actionType: req.actionType,
    proposedAction: `${req.platform}:${req.operation} on ${req.account_external_id}`,
    currentState: req.beforeState,
    proposedState: redactSecrets(req.params) as Record<string, unknown>,
    expectedReason: `Agent-proposed ${req.platform} mutation via TFast Tool Gateway`,
    clientId: scope.client_id,
    adAccountId: req.account_external_id,
    financialImpact: req.budget
      ? { currency: req.budget.currency, delta_per_day: req.budget.deltaPerDay, description: req.budget.description }
      : { currency: proposal.currency, description: 'Non-budget mutation' },
    mode,
    budgetAllowed: budgetDecision.allowed,
    budgetRequiresApproval: budgetDecision.requires_approval,
    budgetReason: budgetDecision.reason,
  });

  const approvalOutcome = evaluateApproval({
    actionType: req.actionType,
    mode,
    budgetRequiresApproval: budgetDecision.requires_approval,
    budgetAllowed: budgetDecision.allowed,
    clientId: scope.client_id,
    requestedBy: scope.actor.id,
  });

  const idempotencyKey = req.idempotencyKey ?? crypto.randomUUID();

  // ── Persist decision trail (§26) ──
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO tool_calls (agency_id, client_id, ad_account_id, tool, mode, proposed_parameters,
                             policy_result, approval_status, before_state, after_state, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11)
     RETURNING id`,
    [
      scope.agency_id, scope.client_id, scope.ad_account_id,
      `${req.platform}:${req.operation}`,
      approvalOutcome.executionAllowed ? 'execute' : 'dry_run',
      JSON.stringify(redactSecrets(req.params)),
      JSON.stringify(dryRun.policy_evaluation),
      approvalOutcome.status,
      JSON.stringify(req.beforeState),
      approvalOutcome.executionAllowed ? JSON.stringify(redactSecrets(req.params)) : null,
      idempotencyKey,
    ],
  );
  const toolCallId = rows[0].id;

  let approvalId: string | undefined;
  if (!approvalOutcome.executionAllowed && approvalOutcome.approvalRequired) {
    const { rows: approvRows } = await pool.query<{ id: string }>(
      `INSERT INTO approvals (agency_id, client_id, tool_call_id, action_type, requested_by, status, required_role)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING id`,
      [scope.agency_id, scope.client_id, toolCallId, req.actionType, scope.actor.id, approvalOutcome.requiredRole ?? minRole],
    );
    approvalId = approvRows[0].id;
  }

  await appendAuditLog(pool, {
    agent: 'tool-gateway',
    agency_id: scope.agency_id,
    client_id: scope.client_id,
    account_id: scope.ad_account_id,
    actor: scope.actor.kind === 'user' ? `user:${scope.actor.id}` : `agent:${scope.actor.id}`,
    action: `${req.platform}:${req.operation}`,
    input: redactSecrets(req.params) as Record<string, unknown>,
    reason: budgetDecision.reason,
    decision: approvalOutcome.reason,
    tool: `${req.platform}:${req.operation}`,
    proposed_parameters: redactSecrets(req.params) as Record<string, unknown>,
    policy_result: dryRun.policy_evaluation as unknown as Record<string, unknown>,
    approval_status: approvalOutcome.status,
    before_state: req.beforeState,
  });

  if (!approvalOutcome.executionAllowed) {
    return {
      ok: true,
      executed: false,
      dry_run: dryRun,
      tool_call_id: toolCallId,
      approval: approvalId
        ? { id: approvalId, status: 'pending', required_role: approvalOutcome.requiredRole ?? minRole }
        : { id: toolCallId, status: 'blocked', required_role: 'owner' },
      message: approvalOutcome.reason,
    };
  }

  // ── Execute (autopilot + budget OK) ──
  try {
    const result = await req.executor();
    await pool.query(
      `UPDATE tool_calls SET execution_result = $2::jsonb, after_state = $3::jsonb WHERE id = $1`,
      [toolCallId, JSON.stringify(redactSecrets(result)), JSON.stringify(redactSecrets(req.params))],
    );
    await appendAuditLog(pool, {
      agent: 'tool-gateway',
      agency_id: scope.agency_id,
      client_id: scope.client_id,
      account_id: scope.ad_account_id,
      actor: scope.actor.kind === 'user' ? `user:${scope.actor.id}` : `agent:${scope.actor.id}`,
      action: `${req.platform}:${req.operation}:executed`,
      input: redactSecrets(req.params) as Record<string, unknown>,
      reason: approvalOutcome.reason,
      decision: 'executed',
      tool: `${req.platform}:${req.operation}`,
      proposed_parameters: redactSecrets(req.params) as Record<string, unknown>,
      policy_result: dryRun.policy_evaluation as unknown as Record<string, unknown>,
      approval_status: 'approved',
      execution_result: redactSecrets(result) as Record<string, unknown>,
      before_state: req.beforeState,
      after_state: redactSecrets(req.params) as Record<string, unknown>,
    });
    return {
      ok: true,
      executed: true,
      dry_run: dryRun,
      tool_call_id: toolCallId,
      execution_result: result,
      message: 'Executed within policy.',
    };
  } catch (err) {
    await pool.query(
      `UPDATE tool_calls SET execution_result = $2::jsonb WHERE id = $1`,
      [toolCallId, JSON.stringify({ error: err instanceof Error ? err.message : String(err) })],
    );
    return {
      ok: false,
      executed: false,
      dry_run: dryRun,
      error: err instanceof Error ? err.message : String(err),
      tool_call_id: toolCallId,
      message: 'Execution failed after policy approval — see error.',
    };
  }
}

export const MutationOutcomeSchema = z.object({
  ok: z.boolean(),
  executed: z.boolean(),
  tool_call_id: z.string(),
  message: z.string(),
});
