/**
 * TFast Morning Brief (§18) — automated agency review workflow.
 * Windows: 1 / 3 / 7 / 14 / 30 days. Deterministic detectors rank findings
 * by severity; optional LLM narrative adds recommendations when providers
 * are reachable. Persists every run to automation_runs.
 */
import { z } from 'zod';
import { pool } from '../db/pool.js';
import type { TenantScope } from '../core/tenant.js';
import { getBrain } from '../services/client-brain.js';
import { getBudgetLimits } from '../services/policies.js';
import { aggregate, detectChanges, rankFindings, type Finding, type SnapshotRow } from './detectors.js';
import { MorningBriefSchema } from '../agents/registry.js';
import { runAgent } from '../agents/run-agent.js';

const WINDOWS = [1, 3, 7, 14, 30] as const;

export interface BriefInput {
  client_id?: string; // omit for agency-wide
  includeAiRecommendations?: boolean;
}

export async function runMorningBrief(scope: TenantScope, input: BriefInput = {}): Promise<z.infer<typeof MorningBriefSchema>> {
  const clientIds: string[] = [];
  if (input.client_id) {
    clientIds.push(input.client_id);
  } else {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM clients WHERE agency_id = $1 ORDER BY name`,
      [scope.agency_id],
    );
    clientIds.push(...rows.map((r) => r.id));
  }

  const sections: z.infer<typeof MorningBriefSchema>['sections'] = {
    critical: [],
    needs_attention: [],
    scaling: [],
    creative_needed: [],
    tracking_problems: [],
    ai_recommendations: [],
    pending_approvals: [],
  };

  for (const clientId of clientIds) {
    const clientScope: TenantScope = { ...scope, client_id: clientId };
    const label = await clientLabel(clientScope);
    const brain = await getBrain(clientScope);
    const economics = (brain.get('economics')?.content ?? {}) as Record<string, unknown>;
    const targetRoas = Number(economics.target_roas ?? 3);
    const targetCpa = Number(economics.target_cpa ?? Number.POSITIVE_INFINITY);
    const limits = await getBudgetLimits(clientScope);
    const dailyCap = limits.daily_max;

    const findings: Finding[] = [];
    const cutoff = 60; // max lookback days to cover prior windows
    const rows = await snapshotRows(clientScope, cutoff);
    for (const w of WINDOWS) {
      if (w === 1) continue; // 1-day windows are too noisy for ratios; covered by 3d
      const curr = aggregate(rows.filter((r) => withinDays(r.stat_date, w)));
      const prior = aggregate(rows.filter((r) => withinDays(r.stat_date, w * 2) && !withinDays(r.stat_date, w)));
      if (curr.days === 0 && prior.days === 0) continue;
      if (curr.days === 0) {
        sections.tracking_problems.push(`${label} — no performance data in the last ${w}d (tracking gap or paused account).`);
        continue;
      }
      findings.push(...detectChanges(curr, prior, w, { targetRoas, targetCpa, dailyCap }));
    }

    // Pending approvals (§13)
    const { rows: approvRows } = await pool.query<{ action_type: string }>(
      `SELECT action_type FROM approvals WHERE agency_id = $1 AND client_id = $2 AND status = 'pending'`,
      [scope.agency_id, clientId],
    );
    for (const a of approvRows) sections.pending_approvals.push(`${label} — pending: ${a.action_type}`);

    // Rank + route findings into brief sections
    const ranked = rankFindings(findings);
    for (const f of ranked.slice(0, 12)) {
      const line = `${label} — ${f.message} [${f.windowDays}d]`;
      switch (f.category) {
        case 'scaling_candidate':
          sections.scaling.push(line);
          break;
        case 'creative_fatigue':
          sections.creative_needed.push(line);
          break;
        case 'tracking_failure':
          sections.tracking_problems.push(line);
          break;
        default:
          if (f.severity === 'critical') sections.critical.push(line);
          else if (f.severity === 'warning') sections.needs_attention.push(line);
          break;
      }
    }

    // Optional LLM narrative
    if (input.includeAiRecommendations && ranked.length > 0) {
      try {
        const narrative = await runAgent<{ recommendations: string[] }>({
          name: 'performance-analyst',
          scope: clientScope,
          schema: z.object({ recommendations: z.array(z.string()) }),
          prompt:
            `Client ${label} findings (last 60d windows):\n` +
            ranked.map((f) => `- [${f.severity}] ${f.message}`).join('\n') +
            `\nReturn JSON: {"recommendations": ["3-5 specific, actionable lines"]}. ` +
            `Respect TFast guardrails: no ad-level budget moves, max 20-30% scaling steps.`,
        });
        for (const r of narrative.recommendations.slice(0, 5)) {
          sections.ai_recommendations.push(`${label} — ${r}`);
        }
      } catch {
        /* providers unreachable — deterministic findings stand alone */
      }
    }
  }

  const brief = MorningBriefSchema.parse({
    date: new Date().toISOString().slice(0, 10),
    sections,
  });

  // Persist the run
  await pool.query(
    `INSERT INTO automation_runs (agency_id, client_id, rule_name, trigger, findings, severity, status, finished_at)
     VALUES ($1, $2, 'morning_brief', $3::jsonb, $4::jsonb,
             $5, 'completed', now())`,
    [
      scope.agency_id, input.client_id ?? null,
      JSON.stringify(input),
      JSON.stringify(brief.sections),
      sections.critical.length > 0 ? 'critical' : sections.needs_attention.length > 0 ? 'warning' : 'info',
    ],
  );

  return brief;
}

export async function listBriefs(scope: TenantScope, limit = 20): Promise<unknown[]> {
  const { rows } = await pool.query(
    `SELECT id, client_id, rule_name, findings, severity, created_at
     FROM automation_runs
     WHERE agency_id = $1 AND rule_name = 'morning_brief'
     ORDER BY created_at DESC
     LIMIT $2`,
    [scope.agency_id, limit],
  );
  return rows;
}

async function clientLabel(scope: TenantScope): Promise<string> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM clients WHERE agency_id = $1 AND id = $2`,
    [scope.agency_id, scope.client_id],
  );
  return rows[0]?.name ?? scope.client_id!;
}

async function snapshotRows(scope: TenantScope, days: number): Promise<SnapshotRow[]> {
  const { rows } = await pool.query<SnapshotRow>(
    `SELECT stat_date::text AS stat_date, spend::float8 AS spend, COALESCE(revenue,0)::float8 AS revenue,
            conversions::float8 AS conversions, impressions::float8 AS impressions, clicks::float8 AS clicks,
            video_play_actions::float8 AS video_play_actions, video_watched_2s::float8 AS video_watched_2s,
            frequency::float8 AS frequency, ctr::float8 AS ctr
     FROM performance_snapshots
     WHERE agency_id = $1 AND client_id = $2 AND entity_type = 'account'
       AND stat_date >= now() - ($3 || ' days')::interval
     ORDER BY stat_date`,
    [scope.agency_id, scope.client_id, String(days)],
  );
  return rows;
}

function withinDays(statDate: string, days: number): boolean {
  const d = new Date(statDate);
  const cutoff = new Date(Date.now() - days * 86400_000);
  return d >= cutoff;
}
