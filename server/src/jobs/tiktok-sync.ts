/**
 * TikTok report sync job — pulls campaign/ad_group/ad reporting through
 * the Tool Gateway and upserts into performance_snapshots + entity tables.
 * Runs per client (or all clients under the agency). Read-only.
 *
 * NOTE: TikTok MCP report shapes vary by server version; the normalizer
 * tolerates both `{dimensions, metrics}` and flat rows, and drops rows it
 * cannot map (never fabricates data).
 */
import { pool } from '../db/pool.js';
import type { TenantScope } from '../core/tenant.js';
import { tiktokConnectionLookup } from '../services/connections.js';
import { tiktokGateway } from '../mcp/tiktok-gateway.js';
import type { TikTokOperation } from '../mcp/tiktok-gateway.js';

export interface SyncSummary {
  client_id?: string;
  synced_clients: number;
  rows: Record<string, number>;
  errors: string[];
}

const LEVELS: Array<{ level: 'campaign' | 'ad_group' | 'ad'; op: TikTokOperation; idKey: string; nameKey: string }> = [
  { level: 'campaign', op: 'report.campaign', idKey: 'campaign_id', nameKey: 'campaign_name' },
  { level: 'ad_group', op: 'report.ad_group', idKey: 'adgroup_id', nameKey: 'adgroup_name' },
  { level: 'ad', op: 'report.ad', idKey: 'ad_id', nameKey: 'ad_name' },
];

export const REPORT_METRICS = [
  'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'reach', 'frequency',
  'conversion', 'cost_per_conversion', 'conversion_rate',
  'video_play_actions', 'video_watched_2s', 'video_watched_6s', 'video_views_p100',
  'total_purchase_value',
];

/** Sync one client (or all clients under the agency). */
export async function syncTikTokReports(scope: TenantScope, days = 30): Promise<SyncSummary> {
  const clientIds: string[] = [];
  if (scope.client_id) {
    clientIds.push(scope.client_id);
  } else {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM clients WHERE agency_id = $1 ORDER BY name`,
      [scope.agency_id],
    );
    clientIds.push(...rows.map((r) => r.id));
  }

  const summary: SyncSummary = { synced_clients: 0, rows: {}, errors: [] };

  for (const clientId of clientIds) {
    const clientScope: TenantScope = { ...scope, client_id: clientId };
    try {
      const ctx = await tiktokConnectionLookup.resolveForClient(clientScope, 'tiktok');
      for (const { level, op, idKey, nameKey } of LEVELS) {
        const count = await syncLevel(clientScope, ctx.advertiser_id, op, level, idKey, nameKey, days);
        summary.rows[level] = (summary.rows[level] ?? 0) + count;
      }
      summary.synced_clients += 1;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('NO_ACTIVE_TIKTOK_CONNECTION')) {
        continue; // client not connected yet — not an error
      }
      summary.errors.push(`client ${clientId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return summary;
}

async function syncLevel(
  scope: TenantScope,
  advertiserId: string,
  op: TikTokOperation,
  entityType: 'campaign' | 'ad_group' | 'ad',
  idKey: string,
  nameKey: string,
  days: number,
): Promise<number> {
  const end = new Date();
  const start = new Date(Date.now() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let total = 0;
  for (let page = 1; page <= 100; page += 1) {
    const res = await tiktokGateway(tiktokConnectionLookup, {
      scope,
      operation: op,
      params: {
        advertiser_id: advertiserId,
        start_date: fmt(start),
        end_date: fmt(end),
        dimensions: ['stat_time_day', idKey, nameKey],
        metrics: REPORT_METRICS,
        page,
        page_size: 100,
      },
    });

    if (!res.ok) throw new Error(res.error ?? 'TikTok report call failed');
    const rows = extractRows(res.data);
    if (rows.length === 0) break;

    const count = await persistRows(scope, entityType, rows, idKey, nameKey);
    total += count;
    if (rows.length < 100) break;
  }
  return total;
}

/** Tolerant row extraction from TikTok report payloads. */
function extractRows(data: unknown): Array<Record<string, unknown>> {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const inner = obj.data as Record<string, unknown> | undefined;
  const list = obj.list ?? inner?.list ?? obj.rows ?? obj.items;
  if (Array.isArray(list)) return list as Array<Record<string, unknown>>;
  if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>;
  return [];
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

async function persistRows(
  scope: TenantScope,
  entityType: 'campaign' | 'ad_group' | 'ad',
  rows: Array<Record<string, unknown>>,
  idKey: string,
  nameKey: string,
): Promise<number> {
  const client = await pool.connect();
  let count = 0;
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const dims = (row.dimensions ?? row) as Record<string, unknown>;
      const m = (row.metrics ?? row) as Record<string, unknown>;

      const externalId = String(dims[idKey] ?? row[idKey] ?? '');
      const statDate = String(dims.stat_time_day ?? row.stat_time_day ?? '').slice(0, 10);
      if (!externalId || !statDate) continue;

      const snapshot = {
        agency_id: scope.agency_id,
        client_id: scope.client_id,
        platform: 'tiktok',
        entity_type: entityType === 'ad_group' ? 'ad_group' : entityType,
        entity_external_id: externalId,
        stat_date: statDate,
        spend: num(m.spend) ?? 0,
        impressions: Math.round(num(m.impressions) ?? 0),
        clicks: Math.round(num(m.clicks) ?? 0),
        ctr: num(m.ctr),
        cpc: num(m.cpc),
        cpm: num(m.cpm),
        reach: num(m.reach) != null ? Math.round(num(m.reach)!) : null,
        frequency: num(m.frequency),
        conversions: num(m.conversion) ?? 0,
        cost_per_conversion: num(m.cost_per_conversion),
        conversion_rate: num(m.conversion_rate),
        video_play_actions: num(m.video_play_actions) != null ? Math.round(num(m.video_play_actions)!) : null,
        video_watched_2s: num(m.video_watched_2s) != null ? Math.round(num(m.video_watched_2s)!) : null,
        video_watched_6s: num(m.video_watched_6s) != null ? Math.round(num(m.video_watched_6s)!) : null,
        video_views_p100: num(m.video_views_p100) != null ? Math.round(num(m.video_views_p100)!) : null,
        total_purchase_value: num(m.total_purchase_value),
        extra: { leads: m.leads ?? null, qualified_leads: m.qualified_leads ?? null },
      };

      await client.query(
        `INSERT INTO performance_snapshots
           (agency_id, client_id, platform, entity_type, entity_external_id, stat_date,
            spend, impressions, clicks, ctr, cpc, cpm, reach, frequency,
            conversions, cost_per_conversion, conversion_rate,
            video_play_actions, video_watched_2s, video_watched_6s, video_views_p100,
            total_purchase_value, extra)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
         ON CONFLICT (platform, entity_type, entity_external_id, stat_date) DO UPDATE SET
           spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks,
           ctr=EXCLUDED.ctr, cpc=EXCLUDED.cpc, cpm=EXCLUDED.cpm, reach=EXCLUDED.reach,
           frequency=EXCLUDED.frequency, conversions=EXCLUDED.conversions,
           cost_per_conversion=EXCLUDED.cost_per_conversion, conversion_rate=EXCLUDED.conversion_rate,
           video_play_actions=EXCLUDED.video_play_actions, video_watched_2s=EXCLUDED.video_watched_2s,
           video_watched_6s=EXCLUDED.video_watched_6s, video_views_p100=EXCLUDED.video_views_p100,
           total_purchase_value=EXCLUDED.total_purchase_value, extra=EXCLUDED.extra`,
        [
          snapshot.agency_id, snapshot.client_id, snapshot.platform, snapshot.entity_type,
          snapshot.entity_external_id, snapshot.stat_date, snapshot.spend, snapshot.impressions,
          snapshot.clicks, snapshot.ctr, snapshot.cpc, snapshot.cpm, snapshot.reach, snapshot.frequency,
          snapshot.conversions, snapshot.cost_per_conversion, snapshot.conversion_rate,
          snapshot.video_play_actions, snapshot.video_watched_2s, snapshot.video_watched_6s,
          snapshot.video_views_p100, snapshot.total_purchase_value,
          JSON.stringify(snapshot.extra),
        ],
      );

      // Entity tables (DO NOTHING — entity configs are updated elsewhere)
      const name = String(dims[nameKey] ?? row[nameKey] ?? externalId);
      const status = String(m.status ?? dims.status ?? 'UNKNOWN');
      const accountRes = await client.query<{ id: string }>(
        `SELECT id FROM ad_accounts WHERE agency_id = $1 AND client_id = $2 AND platform = 'tiktok' LIMIT 1`,
        [scope.agency_id, scope.client_id],
      );
      const adAccountId = accountRes.rows[0]?.id;
      if (!adAccountId) continue;

      if (entityType === 'campaign') {
        await client.query(
          `INSERT INTO campaigns (agency_id, client_id, ad_account_id, platform, external_id, name, status)
           VALUES ($1,$2,$3,'tiktok',$4,$5,$6)
           ON CONFLICT (ad_account_id, platform, external_id) DO NOTHING`,
          [scope.agency_id, scope.client_id, adAccountId, externalId, name, status],
        );
      } else if (entityType === 'ad_group') {
        const campId = String(dims.campaign_id ?? row.campaign_id ?? '');
        const campRes = await client.query<{ id: string }>(
          `SELECT id FROM campaigns WHERE ad_account_id = $1 AND platform = 'tiktok' AND external_id = $2`,
          [adAccountId, campId],
        );
        if (campRes.rows[0]) {
          await client.query(
            `INSERT INTO ad_groups (agency_id, client_id, ad_account_id, campaign_id, platform, external_id, name, status)
             VALUES ($1,$2,$3,$4,'tiktok',$5,$6,$7)
             ON CONFLICT (ad_account_id, platform, external_id) DO NOTHING`,
            [scope.agency_id, scope.client_id, adAccountId, campRes.rows[0].id, externalId, name, status],
          );
        }
      } else {
        const agId = String(dims.adgroup_id ?? row.adgroup_id ?? '');
        const agRes = await client.query<{ id: string }>(
          `SELECT id FROM ad_groups WHERE ad_account_id = $1 AND platform = 'tiktok' AND external_id = $2`,
          [adAccountId, agId],
        );
        if (agRes.rows[0]) {
          await client.query(
            `INSERT INTO ads (agency_id, client_id, ad_account_id, ad_group_id, platform, external_id, name, status)
             VALUES ($1,$2,$3,$4,'tiktok',$5,$6,$7)
             ON CONFLICT (ad_account_id, platform, external_id) DO NOTHING`,
            [scope.agency_id, scope.client_id, adAccountId, agRes.rows[0].id, externalId, name, status],
          );
        }
      }
      count += 1;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release?.();
  }
  return count;
}
