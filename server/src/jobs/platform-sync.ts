/**
 * Meta / Google report sync — pulls campaign, ad-set/ad-group and ad
 * reporting through the platform gateways and upserts into
 * performance_snapshots + entity tables. Runs per client (or all clients
 * under the agency). Read-only.
 *
 * Report tools are keyword-discovered on the connected MCP server, so the
 * sync tries the common report parameter shapes in order and surfaces the
 * real error if none apply — it never fabricates data.
 */
import { pool } from '../db/pool.js';
import type { TenantScope } from '../core/tenant.js';
import { metaGateway, type MetaOperation } from '../mcp/meta-gateway.js';
import { googleGateway, type GoogleOperation } from '../mcp/google-gateway.js';

export interface SyncSummary {
  client_id?: string;
  synced_clients: number;
  rows: Record<string, number>;
  errors: string[];
}

type Platform = 'meta' | 'google';

interface LevelSpec {
  level: 'campaign' | 'ad_group' | 'ad';
  op: string;
  idKey: string;
  nameKey: string;
  parentKey: string;
}

const LEVELS: Record<Platform, LevelSpec[]> = {
  meta: [
    { level: 'campaign', op: 'report.campaign', idKey: 'campaign_id', nameKey: 'campaign_name', parentKey: '' },
    { level: 'ad_group', op: 'report.adset', idKey: 'adset_id', nameKey: 'adset_name', parentKey: 'campaign_id' },
    { level: 'ad', op: 'report.ad', idKey: 'ad_id', nameKey: 'ad_name', parentKey: 'adset_id' },
  ],
  google: [
    { level: 'campaign', op: 'report.campaign', idKey: 'campaign_id', nameKey: 'campaign_name', parentKey: '' },
    { level: 'ad_group', op: 'report.ad_group', idKey: 'ad_group_id', nameKey: 'ad_group_name', parentKey: 'campaign_id' },
    { level: 'ad', op: 'report.ad', idKey: 'ad_id', nameKey: 'ad_name', parentKey: 'ad_group_id' },
  ],
};

const NO_CONNECTION_PREFIX: Record<Platform, string> = {
  meta: 'NO_ACTIVE_META_CONNECTION',
  google: 'NO_ACTIVE_GOOGLE_CONNECTION',
};

/** Common report parameter shapes, tried in order per platform. */
function paramAttempts(platform: Platform, days: number): Array<Record<string, unknown>> {
  const end = new Date();
  const start = new Date(Date.now() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const start_date = fmt(start);
  const end_date = fmt(end);
  if (platform === 'meta') {
    return [
      { date_preset: `last_${days}d`, limit: 100 },
      { start_date, end_date, limit: 100 },
    ];
  }
  return [
    { start_date, end_date, page_size: 100 },
    { date_preset: `last_${days}d`, page_size: 100 },
  ];
}

async function callGateway(
  platform: Platform,
  scope: TenantScope,
  operation: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  if (platform === 'meta') {
    return metaGateway({ scope, operation: operation as MetaOperation, params });
  }
  return googleGateway({ scope, operation: operation as GoogleOperation, params });
}

/** Sync one client (or all clients under the agency) for one platform. */
export async function syncPlatformReports(
  platform: Platform,
  scope: TenantScope,
  days = 30,
): Promise<SyncSummary> {
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
      for (const spec of LEVELS[platform]) {
        const count = await syncLevel(platform, clientScope, spec, days);
        summary.rows[spec.level] = (summary.rows[spec.level] ?? 0) + count;
      }
      summary.synced_clients += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith(NO_CONNECTION_PREFIX[platform])) continue; // client not connected yet — not an error
      summary.errors.push(`client ${clientId}: ${message}`);
    }
  }
  return summary;
}

async function syncLevel(
  platform: Platform,
  scope: TenantScope,
  spec: LevelSpec,
  days: number,
): Promise<number> {
  const attempts = paramAttempts(platform, days);
  let lastError = 'report call failed';

  for (const params of attempts) {
    const res = await callGateway(platform, scope, spec.op, params);
    if (!res.ok) {
      lastError = res.error ?? lastError;
      continue;
    }
    const rows = extractRows(res.data);
    if (rows.length === 0) return 0;
    return persistRows(platform, scope, spec, rows);
  }
  throw new Error(lastError);
}

/** Tolerant row extraction from report payloads. */
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
  platform: Platform,
  scope: TenantScope,
  spec: LevelSpec,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  const client = await pool.connect();
  let count = 0;
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const dims = (row.dimensions ?? row) as Record<string, unknown>;
      const m = (row.metrics ?? row) as Record<string, unknown>;

      const externalId = String(dims[spec.idKey] ?? row[spec.idKey] ?? '');
      const statDate = String(
        dims.date_start ?? dims.stat_time_day ?? row.date_start ?? row.stat_time_day ?? '',
      ).slice(0, 10);
      if (!externalId || !statDate) continue;

      const snapshot = {
        agency_id: scope.agency_id,
        client_id: scope.client_id,
        platform,
        entity_type: spec.level,
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
        conversions: num(m.conversion) ?? num(m.conversions) ?? 0,
        cost_per_conversion: num(m.cost_per_conversion),
        conversion_rate: num(m.conversion_rate),
        video_play_actions: num(m.video_play_actions) != null ? Math.round(num(m.video_play_actions)!) : null,
        video_watched_2s: num(m.video_watched_2s) != null ? Math.round(num(m.video_watched_2s)!) : null,
        video_watched_6s: num(m.video_watched_6s) != null ? Math.round(num(m.video_watched_6s)!) : null,
        video_views_p100: num(m.video_views_p100) != null ? Math.round(num(m.video_views_p100)!) : null,
        total_purchase_value: num(m.total_purchase_value) ?? num(m.purchase_value),
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
      const name = String(dims[spec.nameKey] ?? row[spec.nameKey] ?? externalId);
      const status = String(m.status ?? dims.status ?? 'UNKNOWN');
      const accountRes = await client.query<{ id: string }>(
        `SELECT id FROM ad_accounts WHERE agency_id = $1 AND client_id = $2 AND platform = $3 LIMIT 1`,
        [scope.agency_id, scope.client_id, platform],
      );
      const adAccountId = accountRes.rows[0]?.id;
      if (!adAccountId) continue;

      if (spec.level === 'campaign') {
        await client.query(
          `INSERT INTO campaigns (agency_id, client_id, ad_account_id, platform, external_id, name, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (ad_account_id, platform, external_id) DO NOTHING`,
          [scope.agency_id, scope.client_id, adAccountId, platform, externalId, name, status],
        );
      } else if (spec.level === 'ad_group') {
        const parentId = String(dims[spec.parentKey] ?? row[spec.parentKey] ?? '');
        const parentRes = await client.query<{ id: string }>(
          `SELECT id FROM campaigns WHERE ad_account_id = $1 AND platform = $2 AND external_id = $3`,
          [adAccountId, platform, parentId],
        );
        if (parentRes.rows[0]) {
          await client.query(
            `INSERT INTO ad_groups (agency_id, client_id, ad_account_id, campaign_id, platform, external_id, name, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (ad_account_id, platform, external_id) DO NOTHING`,
            [scope.agency_id, scope.client_id, adAccountId, parentRes.rows[0].id, platform, externalId, name, status],
          );
        }
      } else {
        const parentId = String(dims[spec.parentKey] ?? row[spec.parentKey] ?? '');
        const parentRes = await client.query<{ id: string }>(
          `SELECT id FROM ad_groups WHERE ad_account_id = $1 AND platform = $2 AND external_id = $3`,
          [adAccountId, platform, parentId],
        );
        if (parentRes.rows[0]) {
          await client.query(
            `INSERT INTO ads (agency_id, client_id, ad_account_id, ad_group_id, platform, external_id, name, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (ad_account_id, platform, external_id) DO NOTHING`,
            [scope.agency_id, scope.client_id, adAccountId, parentRes.rows[0].id, platform, externalId, name, status],
          );
        }
      }
      count += 1;
    }
    await client.query('COMMIT');
    return count;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release?.();
  }
}
