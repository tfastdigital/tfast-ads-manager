/**
 * Business Outcomes (Phase 7, §19–20).
 * Leads (staged journey), revenue events, campaign attribution quality
 * (the "Campaign B with higher CPL but 7× qualified" analysis) and
 * contribution profit. Never optimize against platform conversions alone.
 */
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { assertClientScoped, type TenantScope } from '../core/tenant.js';

export const LEAD_STAGES = ['lead', 'qualified_lead', 'appointment', 'show', 'customer'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
const STAGE_ORDER: Record<LeadStage, number> = { lead: 0, qualified_lead: 1, appointment: 2, show: 3, customer: 4 };

export const LeadInputSchema = z.object({
  external_id: z.string().optional(),
  campaign_external_id: z.string().optional(),
  ad_external_id: z.string().optional(),
  platform: z.string().optional(),
  contact: z.record(z.string(), z.unknown()).default({}),
  stage: z.enum(LEAD_STAGES).default('lead'),
});

export async function ingestLead(scope: TenantScope, input: z.infer<typeof LeadInputSchema>): Promise<{ lead_id: string }> {
  assertClientScoped(scope);

  let campaignId: string | null = null;
  let adId: string | null = null;
  if (input.campaign_external_id) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM campaigns WHERE agency_id = $1 AND client_id = $2 AND external_id = $3`,
      [scope.agency_id, scope.client_id, input.campaign_external_id],
    );
    campaignId = rows[0]?.id ?? null;
  }
  if (input.ad_external_id) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM ads WHERE agency_id = $1 AND client_id = $2 AND external_id = $3`,
      [scope.agency_id, scope.client_id, input.ad_external_id],
    );
    adId = rows[0]?.id ?? null;
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO leads (agency_id, client_id, external_id, source_campaign_id, source_ad_id, platform, contact, stage, qualified_at, converted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8,
             CASE WHEN $8 IN ('qualified_lead','appointment','show','customer') THEN now() END,
             CASE WHEN $8 = 'customer' THEN now() END)
     ON CONFLICT (client_id, external_id) DO UPDATE SET stage = EXCLUDED.stage
     RETURNING id`,
    [
      scope.agency_id, scope.client_id, input.external_id ?? crypto.randomUUID(),
      campaignId, adId, input.platform ?? 'unknown', JSON.stringify(input.contact), input.stage,
    ],
  );
  await pool.query(
    `INSERT INTO lead_events (lead_id, event) VALUES ($1, $2)`,
    [rows[0].id, input.stage === 'lead' ? 'created' : mapStageToEvent(input.stage)],
  );
  return { lead_id: rows[0].id };
}

function mapStageToEvent(stage: LeadStage): string {
  return ({ lead: 'created', qualified_lead: 'qualified', appointment: 'appointment', show: 'showed', customer: 'purchased' })[stage];
}

export async function transitionLead(
  scope: TenantScope,
  leadId: string,
  event: z.infer<typeof LeadEventSchema>,
): Promise<{ lead_id: string; stage: LeadStage }> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ stage: LeadStage }>(
    `SELECT stage FROM leads WHERE id = $1 AND agency_id = $2 AND client_id = $3`,
    [leadId, scope.agency_id, scope.client_id],
  );
  const lead = rows[0];
  if (!lead) throw new Error('LEAD_NOT_FOUND');

  const eventStage: Record<string, LeadStage> = {
    created: 'lead', qualified: 'qualified_lead', appointment: 'appointment', showed: 'show', purchased: 'customer', refunded: 'customer',
  };
  const target = eventStage[event.event];
  if (!target) throw new Error('UNKNOWN_EVENT');
  const newStage = STAGE_ORDER[target] > STAGE_ORDER[lead.stage] ? target : lead.stage;

  await pool.query(
    `UPDATE leads SET stage = $2, qualified_at = COALESCE(qualified_at, CASE WHEN $2 IN ('qualified_lead','appointment','show','customer') THEN now() END), converted_at = COALESCE(converted_at, CASE WHEN $2 = 'customer' THEN now() END)
     WHERE id = $1 AND agency_id = $3 AND client_id = $4`,
    [leadId, newStage, scope.agency_id, scope.client_id],
  );
  await pool.query(
    `INSERT INTO lead_events (lead_id, event, amount, occurred_at) VALUES ($1, $2, $3, now())`,
    [leadId, event.event, event.amount ?? null],
  );
  if (event.event === 'purchased' && event.amount != null) {
    await pool.query(
      `INSERT INTO purchases (agency_id, client_id, lead_id, revenue, costs, occurred_at)
       VALUES ($1, $2, $3, $4, '{}', now())`,
      [scope.agency_id, scope.client_id, leadId, event.amount],
    );
  }
  return { lead_id: leadId, stage: newStage };
}

export const LeadEventSchema = z.object({
  event: z.enum(['created', 'qualified', 'appointment', 'showed', 'purchased', 'refunded']),
  amount: z.number().optional(),
});

export const RevenueInputSchema = z.object({
  source: z.enum(['crm', 'ecommerce', 'booking', 'payments']),
  external_id: z.string().optional(),
  type: z.enum(['purchase', 'refund']),
  amount: z.number(),
  currency: z.string().default('USD'),
  fees: z.record(z.string(), z.number()).default({}),
  customer_id: z.string().uuid().optional(),
});

export async function ingestRevenue(scope: TenantScope, input: z.infer<typeof RevenueInputSchema>): Promise<{ revenue_event_id: string }> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO revenue_events (agency_id, client_id, source, external_id, type, amount, currency, fees, customer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING id`,
    [
      scope.agency_id, scope.client_id, input.source, input.external_id ?? crypto.randomUUID(),
      input.type, input.amount, input.currency, JSON.stringify(input.fees), input.customer_id ?? null,
    ],
  );
  return { revenue_event_id: rows[0].id };
}

/**
 * Attribution quality report (§19) — the campaign-level table that lets
 * the AI recognize "higher CPL but far more qualified leads" as value.
 */
export interface CampaignAttributionRow {
  campaign_id: string;
  campaign_name: string;
  leads: number;
  qualified: number;
  appointments: number;
  customers: number;
  spend: number;
  revenue: number;
  cpl: number;
  qualified_cpl: number;
  customer_cpa: number;
}

export async function attributionReport(scope: TenantScope, days = 30): Promise<CampaignAttributionRow[]> {
  assertClientScoped(scope);
  const { rows: leadRows } = await pool.query<Omit<CampaignAttributionRow, 'spend' | 'revenue' | 'cpl' | 'qualified_cpl' | 'customer_cpa'>>(
    `SELECT l.source_campaign_id AS campaign_id, c.name AS campaign_name,
            COUNT(*)::int AS leads,
            COUNT(*) FILTER (WHERE l.stage IN ('qualified_lead','appointment','show','customer'))::int AS qualified,
            COUNT(*) FILTER (WHERE l.stage IN ('appointment','show','customer'))::int AS appointments,
            COUNT(*) FILTER (WHERE l.stage = 'customer')::int AS customers
     FROM leads l
     JOIN campaigns c ON c.id = l.source_campaign_id
     WHERE l.agency_id = $1 AND l.client_id = $2 AND l.created_at >= now() - ($3 || ' days')::interval
     GROUP BY l.source_campaign_id, c.name
     ORDER BY leads DESC`,
    [scope.agency_id, scope.client_id, String(days)],
  );

  const { rows: spendRows } = await pool.query<{ campaign_id: string; spend: number; revenue: number }>(
    `SELECT c.id AS campaign_id,
            COALESCE(SUM(p.spend),0)::float8 AS spend,
            COALESCE(SUM(p.revenue),0)::float8 AS revenue
     FROM campaigns c
     LEFT JOIN performance_snapshots p
       ON p.entity_type = 'campaign' AND p.entity_external_id = c.external_id
      AND p.stat_date >= now() - ($3 || ' days')::interval AND p.client_id = c.client_id
     WHERE c.agency_id = $1 AND c.client_id = $2
     GROUP BY c.id`,
    [scope.agency_id, scope.client_id, String(days)],
  );
  const spendMap = new Map(spendRows.map((s) => [s.campaign_id, s]));

  return leadRows.map((r) => {
    const s = spendMap.get(r.campaign_id) ?? { spend: 0, revenue: 0 };
    return {
      ...r,
      spend: Number(s.spend),
      revenue: Number(s.revenue),
      cpl: r.leads > 0 ? Number(s.spend) / r.leads : 0,
      qualified_cpl: r.qualified > 0 ? Number(s.spend) / r.qualified : 0,
      customer_cpa: r.customers > 0 ? Number(s.spend) / r.customers : 0,
    };
  });
}

/** Contribution profit per campaign (§20). */
export interface ProfitRow {
  campaign_id: string;
  campaign_name: string;
  revenue: number;
  refunds: number;
  cogs: number;
  payment_fees: number;
  shipping: number;
  discounts: number;
  sales_commissions: number;
  ad_spend: number;
  contribution_profit: number;
}

export async function profitReport(scope: TenantScope, days = 30): Promise<ProfitRow[]> {
  assertClientScoped(scope);
  const { rows } = await pool.query<Omit<ProfitRow, 'contribution_profit'>>(
    `SELECT l.source_campaign_id AS campaign_id, c.name AS campaign_name,
            COALESCE(SUM(pu.revenue),0)::float8 AS revenue,
            COALESCE(SUM(pu.refunds),0)::float8 AS refunds,
            COALESCE(SUM((pu.costs->>'cogs')::numeric),0)::float8 AS cogs,
            COALESCE(SUM((pu.costs->>'payment_fees')::numeric),0)::float8 AS payment_fees,
            COALESCE(SUM((pu.costs->>'shipping')::numeric),0)::float8 AS shipping,
            COALESCE(SUM((pu.costs->>'discounts')::numeric),0)::float8 AS discounts,
            COALESCE(SUM((pu.costs->>'sales_commissions')::numeric),0)::float8 AS sales_commissions,
            0::float8 AS ad_spend
     FROM purchases pu
     JOIN leads l ON l.id = pu.lead_id
     JOIN campaigns c ON c.id = l.source_campaign_id
     WHERE pu.agency_id = $1 AND pu.client_id = $2 AND pu.occurred_at >= now() - ($3 || ' days')::interval
     GROUP BY l.source_campaign_id, c.name
     ORDER BY revenue DESC`,
    [scope.agency_id, scope.client_id, String(days)],
  );

  // Ad spend per campaign from snapshots
  const { rows: spendRows } = await pool.query<{ campaign_id: string; spend: number }>(
    `SELECT c.id AS campaign_id, COALESCE(SUM(p.spend),0)::float8 AS spend
     FROM campaigns c
     LEFT JOIN performance_snapshots p
       ON p.entity_type = 'campaign' AND p.entity_external_id = c.external_id
      AND p.stat_date >= now() - ($3 || ' days')::interval AND p.client_id = c.client_id
     WHERE c.agency_id = $1 AND c.client_id = $2
     GROUP BY c.id`,
    [scope.agency_id, scope.client_id, String(days)],
  );
  const spendMap = new Map(spendRows.map((s) => [s.campaign_id, Number(s.spend)]));

  return rows.map((r) => {
    const adSpend = spendMap.get(r.campaign_id) ?? 0;
    const contribution =
      r.revenue - r.refunds - r.cogs - r.payment_fees - r.shipping - r.discounts - r.sales_commissions - adSpend;
    return { ...r, ad_spend: adSpend, contribution_profit: contribution };
  });
}
