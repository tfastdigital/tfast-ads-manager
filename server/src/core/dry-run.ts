/**
 * Dry-Run Engine (§15).
 *
 * Every write-capable advertising tool supports DRY RUN before EXECUTE.
 * A dry run returns the full decision surface; execution proceeds only
 * when policies permit (and approvals pass, if required).
 */
import { z } from 'zod';

export const DryRunResultSchema = z.object({
  proposed_action: z.string(),
  current_state: z.record(z.string(), z.unknown()),
  proposed_state: z.record(z.string(), z.unknown()),
  expected_reason: z.string(),
  affected_client: z.string(),
  affected_account: z.string().optional(),
  affected_campaign: z.string().optional(),
  financial_impact: z.object({
    currency: z.string(),
    delta_per_day: z.number().optional(),
    delta_total: z.number().optional(),
    description: z.string(),
  }),
  policy_evaluation: z.object({
    action_type: z.string(),
    mode: z.enum(['advisory', 'approval', 'autopilot', 'owner_approval', 'forbidden']),
    budget_decision: z.object({
      allowed: z.boolean(),
      requires_approval: z.boolean(),
      reason: z.string(),
    }),
    policy_allows_execution: z.boolean(),
  }),
  approval_requirement: z.enum(['none', 'approval', 'owner_approval', 'blocked']),
});

export type DryRunResult = z.infer<typeof DryRunResultSchema>;

export interface DryRunInput {
  actionType: string;
  proposedAction: string;
  currentState: Record<string, unknown>;
  proposedState: Record<string, unknown>;
  expectedReason: string;
  clientId: string;
  adAccountId?: string;
  campaignId?: string;
  financialImpact: DryRunResult['financial_impact'];
  /** policy mode resolved from automation_policies */
  mode: DryRunResult['policy_evaluation']['mode'];
  budgetAllowed: boolean;
  budgetRequiresApproval: boolean;
  budgetReason: string;
}

/** Pure assembly of the dry-run surface. Persisted to tool_calls (mode=dry_run). */
export function buildDryRunResult(input: DryRunInput): DryRunResult {
  let policyAllows = true;
  let approvalRequirement: DryRunResult['approval_requirement'];

  switch (input.mode) {
    case 'forbidden':
      policyAllows = false;
      approvalRequirement = 'blocked';
      break;
    case 'advisory':
      approvalRequirement = 'approval'; // human executes anyway
      break;
    case 'autopilot':
      approvalRequirement = input.budgetRequiresApproval ? 'approval' : 'none';
      break;
    case 'approval':
      approvalRequirement = 'approval';
      break;
    case 'owner_approval':
      approvalRequirement = 'owner_approval';
      break;
  }

  if (!input.budgetAllowed) {
    policyAllows = false;
    approvalRequirement = 'blocked';
  }

  return DryRunResultSchema.parse({
    proposed_action: input.proposedAction,
    current_state: input.currentState,
    proposed_state: input.proposedState,
    expected_reason: input.expectedReason,
    affected_client: input.clientId,
    affected_account: input.adAccountId,
    affected_campaign: input.campaignId,
    financial_impact: input.financialImpact,
    policy_evaluation: {
      action_type: input.actionType,
      mode: input.mode,
      budget_decision: {
        allowed: input.budgetAllowed,
        requires_approval: input.budgetRequiresApproval,
        reason: input.budgetReason,
      },
      policy_allows_execution: policyAllows,
    },
    approval_requirement: approvalRequirement,
  });
}
