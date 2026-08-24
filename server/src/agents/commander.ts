/**
 * TFast Agency Commander (§3) — portfolio-level orchestration.
 *
 * The Commander NEVER calls write tools directly: it aggregates data and
 * emits structured findings/recommendations that enter the safety pipeline.
 * Deterministic status classification (targets from Client Brains) is the
 * base layer; the LLM adds narrative flags when data exists.
 */
import { z } from 'zod';
import { pool } from '../db/pool.js';
import type { TenantScope } from '../core/tenant.js';
import { getBrain } from '../services/client-brain.js';
import { runAgent } from './run-agent.js';
import { PortfolioSnapshotSchema } from './registry.js';

interface ClientRollup {
  client_id: string;
  client_name: string;
  spend: number;
  revenue: number;
  conversions: number;
  leads: number;
  qualified_leads: number;
  roas: number;
  cpa: number;
}

/** Deterministic portfolio rollup from account-level snapshots (last 7 days). */
export async function portfolioSnapshot(scope: TenantScope): Promise<z.infer<typeof PortfolioSnapshotSchema>> {
  // LEFT JOIN so clients with no performance data still appear (watch status).
  const { rows } = await pool.query<ClientRollup>(
    `SELECT c.id AS client_id, c.name AS client_name,
            COALESCE(SUM(p.spend), 0)::float8    AS spend,
            COALESCE(SUM(p.revenue), 0)::float8  AS revenue,
            COALESCE(SUM(p.conversions), 0)::float8 AS conversions,
            COALESCE(SUM((p.extra->>'leads')::numeric), 0)::float8 AS leads,
            COALESCE(SUM((p.extra->>'qualified_leads')::numeric), 0)::float8 AS qualified_leads
     FROM clients c
     LEFT JOIN performance_snapshots p
       ON p.client_id = c.id
      AND p.agency_id = c.agency_id
      AND p.entity_type = 'account'
      AND p.stat_date >= now() - interval '7 days'
     WHERE c.agency_id = $1
     GROUP BY c.id, c.name
     ORDER BY c.name`,
    [scope.agency_id],
  );

  const clients = [];
  const totals = { spend: 0, revenue: 0, roas: 0, leads: 0, qualified_leads: 0, cpa: 0, cpl: 0 };

  for (const row of rows) {
    const roas = row.spend > 0 ? row.revenue / row.spend : 0;
    const cpa = row.conversions > 0 ? row.spend / row.conversions : 0;
    const brain = await getBrain({ ...scope, client_id: row.client_id });
    const economics = (brain.get('economics')?.content ?? {}) as Record<string, unknown>;
    const targetRoas = Number(economics.target_roas ?? 3);
    const targetCpa = Number(economics.target_cpa ?? Number.POSITIVE_INFINITY);

    let status: 'healthy' | 'watch' | 'critical' = 'healthy';
    const flags: string[] = [];
    if (roas > 0 && roas < 0.8 * targetRoas) {
      status = 'critical';
      flags.push(`ROAS ${roas.toFixed(2)} below 0.8× target ${targetRoas}`);
    } else if (roas > 0 && roas < targetRoas) {
      status = 'watch';
      flags.push(`ROAS ${roas.toFixed(2)} below target ${targetRoas}`);
    }
    if (cpa > 0 && Number.isFinite(targetCpa) && cpa > 1.5 * targetCpa) {
      status = 'critical';
      flags.push(`CPA $${cpa.toFixed(2)} exceeds 1.5× target $${targetCpa.toFixed(2)}`);
    }
    if (row.spend === 0) {
      status = 'watch';
      flags.push('No spend recorded in last 7 days (tracking or delivery gap)');
    }

    totals.spend += row.spend;
    totals.revenue += row.revenue;
    totals.leads += row.leads;
    totals.qualified_leads += row.qualified_leads;

    clients.push({
      client_id: row.client_id,
      status,
      flags,
      _name: row.client_name,
      _roas: roas,
      _cpa: cpa,
    });
  }

  totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  totals.cpa = totals.qualified_leads + totals.leads > 0 ? totals.spend / (totals.qualified_leads + totals.leads) : 0;

  const cleanClients = clients.map(({ client_id, status, flags }) => ({ client_id, status, flags }));

  return PortfolioSnapshotSchema.parse({
    agency_id: scope.agency_id,
    as_of: new Date().toISOString(),
    totals,
    clients: cleanClients,
  });
}

/**
 * Commander answer path: deterministic snapshot + LLM narrative when data exists.
 * Returns plain-text answer for chat + the structured snapshot.
 */
export async function commanderAnswer(
  scope: TenantScope,
  question: string,
): Promise<{ answer: string; snapshot?: z.infer<typeof PortfolioSnapshotSchema> }> {
  let snapshot: z.infer<typeof PortfolioSnapshotSchema> | undefined;
  try {
    snapshot = await portfolioSnapshot(scope);
  } catch {
    snapshot = undefined; // empty DB is fine during onboarding
  }

  if (!snapshot || snapshot.clients.length === 0) {
    return {
      answer:
        'The portfolio has no recorded performance data yet. Onboard clients, connect ad accounts ' +
        '(TikTok via the Tool Gateway), and run a reporting sync before asking portfolio questions.',
    };
  }

  const summary = snapshot.clients
    .map((c) => `- ${c.client_id}: ${c.status}${c.flags.length ? ` — ${c.flags.join('; ')}` : ''}`)
    .join('\n');

  const narrative = await runAgent<{ answer: string }>({
    name: 'tfast-agency-commander',
    scope,
    schema: z.object({ answer: z.string() }),
    prompt:
      `Question: ${question}\n\nPortfolio snapshot (deterministic):\n${summary}\n\n` +
      `Answer the question from this data. Be specific, name clients, and rank by severity. ` +
      `Return JSON: {"answer": string}.`,
  }).catch(() => ({ answer: summary }));

  return { answer: narrative.answer, snapshot };
}
