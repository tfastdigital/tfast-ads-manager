/**
 * Approval Engine — deterministic enforcement of automation modes.
 *
 * Modes per client per action_type:
 *   advisory       — AI analyzes, human executes (AI may not execute)
 *   approval       — AI prepares, human approves, AI executes
 *   autopilot      — AI executes within strict policies (budget governor still applies)
 *   owner_approval — requires owner-level approval
 *   forbidden      — never executable by AI
 */
export type AutomationMode = 'advisory' | 'approval' | 'autopilot' | 'owner_approval' | 'forbidden';

export interface ApprovalRequest {
  actionType: string;
  mode: AutomationMode;
  budgetRequiresApproval: boolean;
  budgetAllowed: boolean;
  clientId: string;
  requestedBy: string;
}

export interface ApprovalOutcome {
  executionAllowed: boolean;
  approvalRequired: boolean;
  requiredRole?: 'owner' | 'admin' | 'media_buyer';
  status: 'approved' | 'pending' | 'blocked';
  reason: string;
}

const REQUIRED_ROLE: Record<AutomationMode, 'owner' | 'admin' | 'media_buyer'> = {
  advisory: 'media_buyer',
  approval: 'media_buyer',
  autopilot: 'media_buyer',
  owner_approval: 'owner',
  forbidden: 'owner',
};

/**
 * Pure policy evaluation. Persisted to approvals table when pending.
 * NOTE: autopilot does NOT bypass the budget governor — an autopilot action
 * that trips a budget limit becomes pending approval.
 */
export function evaluateApproval(req: ApprovalRequest): ApprovalOutcome {
  if (req.mode === 'forbidden') {
    return {
      executionAllowed: false,
      approvalRequired: false,
      requiredRole: 'owner',
      status: 'blocked',
      reason: `Action type "${req.actionType}" is forbidden for this client.`,
    };
  }

  if (!req.budgetAllowed) {
    return {
      executionAllowed: false,
      approvalRequired: false,
      requiredRole: 'owner',
      status: 'blocked',
      reason: 'Budget Governor denied the operation.',
    };
  }

  if (req.mode === 'advisory') {
    return {
      executionAllowed: false, // AI never executes advisory actions
      approvalRequired: true,
      requiredRole: 'media_buyer',
      status: 'pending',
      reason: 'Advisory mode: AI prepares the action, a human executes it.',
    };
  }

  if (req.mode === 'owner_approval') {
    return {
      executionAllowed: false,
      approvalRequired: true,
      requiredRole: 'owner',
      status: 'pending',
      reason: 'This action requires owner-level approval.',
    };
  }

  if (req.mode === 'approval' || req.budgetRequiresApproval) {
    return {
      executionAllowed: false,
      approvalRequired: true,
      requiredRole: 'media_buyer',
      status: 'pending',
      reason:
        req.mode === 'approval'
          ? `Action type "${req.actionType}" requires human approval.`
          : 'Budget Governor requires approval for this step size.',
    };
  }

  // autopilot + budget OK
  return {
    executionAllowed: true,
    approvalRequired: false,
    status: 'approved',
    reason: 'Autopilot action within budget policy.',
  };
}
