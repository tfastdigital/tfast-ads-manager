/**
 * Connection Registry service (§9) + TikTok resolver (§7).
 * credential_reference stores a pointer to the server-side secret store —
 * never the credential itself. Agents resolve accounts through this
 * service, never by guessing advertiser IDs.
 */
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { assertClientScoped, assertSameTenant, type TenantScope } from '../core/tenant.js';
import type { ConnectionLookup, ResolvedTikTokContext } from '../mcp/tiktok-gateway.js';

export const ConnectionInputSchema = z.object({
  provider: z.enum(['tiktok', 'meta', 'google']),
  external_account_id: z.string().min(1),
  advertiser_id: z.string().optional(),
  credential_reference: z.string().min(1),
  permissions: z.array(z.string()).default([]),
});

export type ConnectionInput = z.infer<typeof ConnectionInputSchema>;

export interface ConnectionRow {
  id: string;
  provider: string;
  external_account_id: string;
  advertiser_id: string | null;
  permissions: string[];
  status: 'pending' | 'active' | 'revoked';
  last_verified_at: Date | null;
}

export async function createConnection(scope: TenantScope, input: ConnectionInput): Promise<ConnectionRow> {
  assertClientScoped(scope);
  const data = ConnectionInputSchema.parse(input);
  const { rows } = await pool.query<ConnectionRow>(
    `INSERT INTO connections (agency_id, client_id, provider, external_account_id, advertiser_id, credential_reference, permissions)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, provider, external_account_id, advertiser_id, permissions, status, last_verified_at`,
    [
      scope.agency_id, scope.client_id, data.provider, data.external_account_id,
      data.advertiser_id ?? null, data.credential_reference, JSON.stringify(data.permissions),
    ],
  );
  return rows[0];
}

export async function listConnections(scope: TenantScope): Promise<ConnectionRow[]> {
  assertClientScoped(scope);
  const { rows } = await pool.query<ConnectionRow>(
    `SELECT id, provider, external_account_id, advertiser_id, permissions, status, last_verified_at
     FROM connections
     WHERE agency_id = $1 AND client_id = $2
     ORDER BY created_at DESC`,
    [scope.agency_id, scope.client_id],
  );
  return rows;
}

export async function setConnectionStatus(
  scope: TenantScope,
  connectionId: string,
  status: 'active' | 'revoked',
): Promise<void> {
  assertClientScoped(scope);
  await pool.query(
    `UPDATE connections
     SET status = $3, updated_at = now(), last_verified_at = CASE WHEN $3 = 'active' THEN now() ELSE last_verified_at END
     WHERE id = $1 AND agency_id = $2 AND client_id = $4`,
    [connectionId, scope.agency_id, status, scope.client_id],
  );
}

/**
 * Generic platform context resolution (Phase 8) — meta / google.
 * account_external_id: TikTok = advertiser_id, Meta = ad account id,
 * Google = customer id. Agents never supply these; they are resolved here.
 */
export interface PlatformContext {
  connection_id: string;
  account_external_id: string;
  ad_account_id: string;
  scope: TenantScope & { client_id: string; ad_account_id: string };
}

export async function resolvePlatformContext(
  scope: TenantScope,
  platform: 'meta' | 'google',
): Promise<PlatformContext> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{
    connection_id: string; external_account_id: string; advertiser_id: string | null; account_id: string;
  }>(
    `SELECT c.id AS connection_id, c.external_account_id, c.advertiser_id, a.id AS account_id
     FROM connections c
     LEFT JOIN ad_accounts a
       ON a.connection_id = c.id AND a.platform = $3
     WHERE c.agency_id = $1 AND c.client_id = $2
       AND c.provider = $3 AND c.status = 'active'
     ORDER BY c.created_at
     LIMIT 1`,
    [scope.agency_id, scope.client_id, platform],
  );
  const row = rows[0];
  if (!row) throw new Error(`NO_ACTIVE_${platform.toUpperCase()}_CONNECTION: no active ${platform} connection for this client`);
  const resolvedScope: TenantScope & { client_id: string; ad_account_id: string } = {
    agency_id: scope.agency_id,
    client_id: scope.client_id,
    ad_account_id: row.account_id ?? row.connection_id,
    actor: scope.actor,
  };
  assertSameTenant(scope, resolvedScope);
  return {
    connection_id: row.connection_id,
    account_external_id: row.advertiser_id ?? row.external_account_id,
    ad_account_id: resolvedScope.ad_account_id,
    scope: resolvedScope,
  };
}

/**
 * TikTok resolver implementing the gateway contract:
 * agency_id/client_id → connection → advertiser_id.
 * Agents CANNOT supply an advertiser_id; it is always resolved here.
 */
export const tiktokConnectionLookup: ConnectionLookup = {
  async resolveForClient(scope: TenantScope, platform: 'tiktok'): Promise<ResolvedTikTokContext> {
    assertClientScoped(scope);
    const { rows } = await pool.query<{
      connection_id: string; advertiser_id: string; account_id: string;
    }>(
      `SELECT c.id AS connection_id, c.advertiser_id, a.id AS account_id
       FROM connections c
       LEFT JOIN ad_accounts a
         ON a.connection_id = c.id AND a.platform = 'tiktok'
       WHERE c.agency_id = $1 AND c.client_id = $2
         AND c.provider = $3 AND c.status = 'active'
       ORDER BY
         CASE
           WHEN c.credential_reference LIKE 'tiktok-mcp:oauth:%' THEN 0
           WHEN c.credential_reference LIKE 'tiktok:oauth:%' THEN 1
           ELSE 2
         END,
         c.created_at DESC
       LIMIT 1`,
      [scope.agency_id, scope.client_id, platform],
    );
    const row = rows[0];
    if (!row || !row.advertiser_id) {
      throw new Error('NO_ACTIVE_TIKTOK_CONNECTION: no active TikTok connection for this client');
    }
    const resolvedScope: TenantScope & { client_id: string; ad_account_id: string } = {
      agency_id: scope.agency_id,
      client_id: scope.client_id,
      ad_account_id: row.account_id ?? row.connection_id,
      actor: scope.actor,
    };
    assertSameTenant(scope, resolvedScope);
    return {
      connection_id: row.connection_id,
      advertiser_id: row.advertiser_id,
      platform: 'tiktok',
      scope: resolvedScope,
    };
  },
  async permissionsFor(connectionId: string): Promise<string[]> {
    const { rows } = await pool.query<{ permissions: string[] }>(
      `SELECT permissions FROM connections WHERE id = $1`,
      [connectionId],
    );
    return rows[0]?.permissions ?? [];
  },
};
