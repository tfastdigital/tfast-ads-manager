/**
 * Agent Registry (§5) — the TFast specialist roster.
 *
 * LLM agents (via providers/router) + deterministic modules (no LLM).
 * Agents communicate through structured outputs (zod) — dev rule 6.
 */
import { z } from 'zod';

export type AgentKind = 'llm' | 'deterministic';

export interface AgentDefinition {
  name: string;
  kind: AgentKind;
  description: string;
  /** task kind used by the model router when this agent is invoked */
  task: import('../providers/router.js').TaskKind | null;
  outputSchema: z.ZodTypeAny;
}

export const PortfolioSnapshotSchema = z.object({
  agency_id: z.string(),
  as_of: z.string(),
  totals: z.object({
    spend: z.number(),
    revenue: z.number(),
    roas: z.number(),
    leads: z.number(),
    qualified_leads: z.number(),
    cpa: z.number(),
    cpl: z.number(),
  }),
  clients: z.array(
    z.object({
      client_id: z.string(),
      status: z.enum(['healthy', 'watch', 'critical']),
      flags: z.array(z.string()),
    }),
  ),
});

export const OptimizationRecommendationSchema = z.object({
  action_type: z.string(),
  entity: z.object({ type: z.string(), external_id: z.string(), platform: z.string() }),
  reason: z.string(),
  current_state: z.record(z.string(), z.unknown()),
  proposed_state: z.record(z.string(), z.unknown()),
  expected_impact: z.object({ metric: z.string(), delta_pct: z.number() }),
  confidence: z.number(),
  risk_note: z.string(),
});

export const CreativeInsightSchema = z.object({
  creative_id: z.string(),
  format: z.string(),
  hook: z.string(),
  hook_type: z.string(),
  presenter_type: z.string(),
  opening_style: z.string(),
  duration_seconds: z.number(),
  problem: z.string(),
  emotions: z.array(z.string()),
  offer: z.string(),
  cta: z.string(),
  caption_style: z.string(),
});

export const ExperimentProposalSchema = z.object({
  observation: z.string(),
  diagnosis: z.string(),
  hypothesis: z.string(),
  variants: z.array(z.string()),
  success_criteria: z.array(z.string()),
  duration_days: z.number(),
});

export const MorningBriefSchema = z.object({
  date: z.string(),
  sections: z.object({
    critical: z.array(z.string()),
    needs_attention: z.array(z.string()),
    scaling: z.array(z.string()),
    creative_needed: z.array(z.string()),
    tracking_problems: z.array(z.string()),
    ai_recommendations: z.array(z.string()),
    pending_approvals: z.array(z.string()),
  }),
});

export const agents: AgentDefinition[] = [
  {
    name: 'tfast-agency-commander',
    kind: 'llm',
    task: 'orchestration',
    description: 'Portfolio-level orchestration. Delegates to specialists; answers agency-level questions; produces the Morning Brief.',
    outputSchema: PortfolioSnapshotSchema,
  },
  {
    name: 'market-intelligence-agent',
    kind: 'llm',
    task: 'classification',
    description: 'Researches markets, competitors, trends, customer conversations and opportunities (API Direct).',
    outputSchema: z.array(z.object({ kind: z.string(), insight: z.string(), confidence: z.number() })),
  },
  {
    name: 'advertising-strategist',
    kind: 'llm',
    task: 'strategy',
    description: 'Campaign, audience, funnel, offer and positioning strategies.',
    outputSchema: z.object({ strategy: z.string(), audiences: z.array(z.string()), offers: z.array(z.string()) }),
  },
  {
    name: 'creative-intelligence-agent',
    kind: 'llm',
    task: 'multimodal_creative',
    description: 'Analyzes winning and losing creatives; extracts structured attributes.',
    outputSchema: CreativeInsightSchema,
  },
  {
    name: 'creative-strategist',
    kind: 'llm',
    task: 'strategy',
    description: 'Hooks, concepts, scripts, CTAs, offers and creative variations.',
    outputSchema: z.object({ hooks: z.array(z.string()), concepts: z.array(z.string()), scripts: z.array(z.string()) }),
  },
  {
    name: 'performance-analyst',
    kind: 'llm',
    task: 'analysis_bulk',
    description: 'Performance analysis: Pareto, baselines, diagnosis (Meta/Google/TikTok methodology skills).',
    outputSchema: z.array(OptimizationRecommendationSchema),
  },
  {
    name: 'optimization-agent',
    kind: 'llm',
    task: 'analysis_synthesis',
    description: 'Finds scaling, pausing and restructuring opportunities.',
    outputSchema: z.array(OptimizationRecommendationSchema),
  },
  {
    name: 'attribution-agent',
    kind: 'llm',
    task: 'analysis_synthesis',
    description: 'Connects advertising activity to leads, sales, bookings and revenue.',
    outputSchema: z.object({ attribution_findings: z.array(z.string()), cpa_quality_notes: z.array(z.string()) }),
  },
  {
    name: 'experiment-agent',
    kind: 'llm',
    task: 'strategy',
    description: 'Creates and evaluates experiments (§12 cycle).',
    outputSchema: ExperimentProposalSchema,
  },
  // ── Deterministic modules (never an LLM in the decision path) ──
  {
    name: 'budget-governor',
    kind: 'deterministic',
    task: null,
    description: 'Enforces financial rules (§14). Implemented in core/budget-governor.ts.',
    outputSchema: z.object({ allowed: z.boolean(), requires_approval: z.boolean(), reason: z.string() }),
  },
  {
    name: 'approval-agent',
    kind: 'deterministic',
    task: null,
    description: 'Determines advisory/approval/autopilot/forbidden enforcement (§13). Implemented in core/approvals.ts.',
    outputSchema: z.object({ executionAllowed: z.boolean(), approvalRequired: z.boolean(), status: z.string(), reason: z.string() }),
  },
];

export function getAgent(name: string): AgentDefinition | undefined {
  return agents.find((a) => a.name === name);
}
