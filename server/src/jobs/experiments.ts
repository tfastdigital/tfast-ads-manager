/**
 * Experiment Engine.
 *   Observation → Diagnosis → Hypothesis → Experiment → Result → Lesson → Memory
 * Every hop is a persisted row with FKs; evaluation is deterministic
 * (variant metrics from snapshots), and successful lessons are promoted
 * to client memory (and can be anonymized into Agency Knowledge).
 */
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { assertClientScoped, type TenantScope } from '../core/tenant.js';
import { remember } from '../services/memory.js';

export const ExperimentInputSchema = z.object({
  observation: z.string().min(1),
  diagnosis: z.string().min(1),
  hypothesis: z.string().min(1),
  title: z.string().min(1),
  variants: z
    .array(
      z.object({
        name: z.string().min(1),
        ad_external_id: z.string().optional(),
        campaign_external_id: z.string().optional(),
      }),
    )
    .min(2),
  success_criteria: z.array(z.string()).min(1),
  duration_days: z.number().int().min(1).max(90).default(14),
});

export type ExperimentInput = z.infer<typeof ExperimentInputSchema>;

export async function createExperiment(scope: TenantScope, input: ExperimentInput): Promise<{ experiment_id: string; observation_id: string; hypothesis_id: string }> {
  assertClientScoped(scope);
  const data = ExperimentInputSchema.parse(input);

  const obs = await pool.query<{ id: string }>(
    `INSERT INTO observations (agency_id, client_id, note) VALUES ($1, $2, $3) RETURNING id`,
    [scope.agency_id, scope.client_id, data.observation],
  );
  const hyp = await pool.query<{ id: string }>(
    `INSERT INTO hypotheses (observation_id, agency_id, client_id, statement, rationale)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [obs.rows[0].id, scope.agency_id, scope.client_id, data.hypothesis, data.diagnosis],
  );
  const exp = await pool.query<{ id: string }>(
    `INSERT INTO experiments (hypothesis_id, agency_id, client_id, title, status, design)
     VALUES ($1, $2, $3, $4, 'running', $5::jsonb) RETURNING id`,
    [
      hyp.rows[0].id, scope.agency_id, scope.client_id, data.title,
      JSON.stringify({
        variants: data.variants,
        success_criteria: data.success_criteria,
        duration_days: data.duration_days,
        created_at: new Date().toISOString(),
      }),
    ],
  );
  return { experiment_id: exp.rows[0].id, observation_id: obs.rows[0].id, hypothesis_id: hyp.rows[0].id };
}

export async function listExperiments(scope: TenantScope): Promise<unknown[]> {
  assertClientScoped(scope);
  const { rows } = await pool.query(
    `SELECT id, title, status, design, result, started_at, ended_at, created_at
     FROM experiments
     WHERE agency_id = $1 AND client_id = $2
     ORDER BY created_at DESC`,
    [scope.agency_id, scope.client_id],
  );
  return rows;
}

export interface VariantResult {
  name: string;
  ad_external_id?: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number;
}

/** Deterministic evaluation: variant metrics from ad-level snapshots. */
export async function evaluateExperiment(scope: TenantScope, experimentId: string): Promise<{
  experiment_id: string;
  winner: string | null;
  variants: VariantResult[];
  lesson_id: string | null;
  result: Record<string, unknown>;
}> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ id: string; title: string; design: Record<string, unknown>; status: string }>(
    `SELECT id, title, design, status FROM experiments WHERE id = $1 AND agency_id = $2 AND client_id = $3`,
    [experimentId, scope.agency_id, scope.client_id],
  );
  const exp = rows[0];
  if (!exp) throw new Error('EXPERIMENT_NOT_FOUND');
  if (exp.status !== 'running') throw new Error(`EXPERIMENT_${exp.status.toUpperCase()}`);

  const design = exp.design as { variants?: Array<{ name: string; ad_external_id?: string }>; duration_days?: number; success_criteria?: string[] };
  const variants = design.variants ?? [];
  const days = design.duration_days ?? 14;

  const results: VariantResult[] = [];
  for (const v of variants) {
    if (!v.ad_external_id) {
      results.push({ name: v.name, spend: 0, revenue: 0, conversions: 0, roas: 0, cpa: 0 });
      continue;
    }
    const { rows: p } = await pool.query<{ spend: number; revenue: number; conversions: number }>(
      `SELECT SUM(spend)::float8 AS spend, SUM(revenue)::float8 AS revenue, SUM(conversions)::float8 AS conversions
       FROM performance_snapshots
       WHERE agency_id = $1 AND client_id = $2 AND entity_type = 'ad'
         AND entity_external_id = $3 AND stat_date >= now() - ($4 || ' days')::interval`,
      [scope.agency_id, scope.client_id, v.ad_external_id, String(days)],
    );
    const spend = Number(p[0]?.spend ?? 0);
    const revenue = Number(p[0]?.revenue ?? 0);
    const conversions = Number(p[0]?.conversions ?? 0);
    results.push({
      name: v.name,
      ad_external_id: v.ad_external_id,
      spend,
      revenue,
      conversions,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: conversions > 0 ? spend / conversions : 0,
    });
  }

  const eligible = results.filter((r) => r.spend > 0 && r.conversions >= 1);
  const winner = eligible.length > 0 ? eligible.reduce((a, b) => (b.roas >= a.roas ? b : a)).name : null;

  const result = {
    evaluated_at: new Date().toISOString(),
    variants: results,
    winner,
    success_criteria: design.success_criteria ?? [],
  };

  await pool.query(
    `UPDATE experiments SET status = 'completed', ended_at = now(), result = $2::jsonb WHERE id = $1`,
    [experimentId, JSON.stringify(result)],
  );

  // Lesson → memory
  let lessonId: string | null = null;
  const lessonContent = winner
    ? `Experiment "${exp.title}": variant "${winner}" won — ROAS ${results.find((r) => r.name === winner)?.roas.toFixed(2)} ` +
      `vs next-best ${eligible.filter((r) => r.name !== winner).map((r) => `${r.name} ${r.roas.toFixed(2)}`).join(', ') || 'n/a'}.`
    : `Experiment "${exp.title}": inconclusive — no variant reached minimum signals.`;

  const lesson = await pool.query<{ id: string }>(
    `INSERT INTO lessons (experiment_id, agency_id, client_id, content, confidence)
     VALUES ($1, $2, $3, $4, 0.7) RETURNING id`,
    [experimentId, scope.agency_id, scope.client_id, lessonContent],
  );
  lessonId = lesson.rows[0].id;

  try {
    await remember(scope, { kind: 'lesson', content: lessonContent, importance: 8 });
  } catch {
    /* embedding provider unreachable — lesson row is the durable record */
  }

  return { experiment_id: experimentId, winner, variants: results, lesson_id: lessonId, result };
}
