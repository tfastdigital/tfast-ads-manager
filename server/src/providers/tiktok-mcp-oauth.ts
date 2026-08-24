/**
 * TikTok for Business MCP Server — OAuth 2.0 custom-agent connection.
 *
 * Implements the official custom-agent flow (portal docs:
 * /docs/how-to-connect-a-custom-agent-to-tiktok-for-business-mcp-server):
 *
 *   1. Discover OIDC config  GET  /open_mcp/{server}/oauth/.well-known/openid-configuration
 *   2. DCR registration      POST /open_mcp/{server}/oauth/register            → client_id
 *   3. PKCE authorize        redirect browser to /portal/mcp-tt4b-authorize
 *   4. Token exchange        POST /open_mcp/{server}/oauth/token (code + verifier)
 *   5. Tool calls            POST /open_mcp/{server}  Authorization: Bearer <access_token>
 *   6. Refresh               grant_type=refresh_token (access 24h, refresh 30d)
 *   7. Revoke (optional)     POST /open_mcp/{server}/oauth/revoke
 *
 * Notes from the docs:
 *  - No developer app or API key needed — DCR returns the client_id.
 *  - Tokens are bound to ONE server path (layer ≠ flat). Never reuse across paths.
 *  - Authorization codes are one-time use; redirect_uri must match 1:1.
 *  - Rate limit: 3 QPS per user across tool calls.
 *
 * DEV: TIKTOK_MOCK_OAUTH=true mocks the whole TikTok side (local callback,
 * any code accepted, fake tokens + advertiser list).
 */
import { randomBytes, createHash } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import type { TenantScope } from '../core/tenant.js';
import { storeTokens, mockTokens, type TikTokTokens } from './tiktok-oauth.js';
import { McpClient } from '../mcp/mcp-client.js';

export const MCP_SERVER = 'tt-ads-mcp-layer'; // progressive disclosure (~40 core tools)
export const MCP_BASE = `https://business-api.tiktok.com/open_mcp/${MCP_SERVER}`;
const CLIENT_NAME = 'TFast Ads Manager';
const CLIENT_REGISTRATION_REF = 'tiktok-mcp:client-registration';

interface OidcConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
}

let oidcCache: OidcConfig | null = null;

/* ── 1. Discover the OAuth configuration ───────────────── */

async function discover(): Promise<OidcConfig> {
  if (!oidcCache) {
    const res = await fetch(`${MCP_BASE}/oauth/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`TIKTOK_MCP_DISCOVERY_FAILED: HTTP ${res.status}`);
    oidcCache = (await res.json()) as OidcConfig;
  }
  return oidcCache;
}

/* ── 2. Dynamic Client Registration (once per agent) ───── */

async function ensureMcpClientId(scope: TenantScope): Promise<string> {
  if (config.TIKTOK_MOCK_OAUTH) return 'mock-client';
  const { rows } = await pool.query<{ value: { client_id?: string } }>(
    `SELECT value FROM secret_store WHERE reference = $1`,
    [CLIENT_REGISTRATION_REF],
  );
  if (rows[0]?.value?.client_id) return rows[0].value.client_id;

  const cfg = await discover();
  const res = await fetch(cfg.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [config.TIKTOK_MCP_REDIRECT_URI ?? ''],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  const data = (await res.json()) as { client_id?: string; error_description?: string };
  if (!res.ok || !data.client_id) {
    throw new Error(`TIKTOK_MCP_REGISTRATION_FAILED: ${data.error_description ?? res.statusText}`);
  }
  // The client_id is public (auth method "none", PKCE protects the flow).
  await pool.query(
    `INSERT INTO secret_store (reference, agency_id, client_id, kind, value)
     VALUES ($1, $2, $3, 'mcp_token', $4::jsonb)
     ON CONFLICT (reference) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [CLIENT_REGISTRATION_REF, scope.agency_id, scope.client_id ?? null, JSON.stringify({ client_id: data.client_id })],
  );
  return data.client_id;
}

/* ── 3. Request user authorization (PKCE) ───────────────── */

export async function startMcpAuth(
  scope: TenantScope,
  redirectBack?: string,
): Promise<{ state: string; auth_url: string }> {
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(64).toString('base64url'); // 86 chars (43–128 required)
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = config.TIKTOK_MCP_REDIRECT_URI ?? '';

  await pool.query(
    `INSERT INTO oauth_states
       (state, agency_id, client_id, user_id, provider, redirect_back, code_verifier, redirect_uri, expires_at)
     VALUES ($1, $2, $3, $4, 'tiktok-mcp', $5, $6, $7, now() + interval '10 minutes')`,
    [state, scope.agency_id, scope.client_id ?? null, scope.actor.id, redirectBack ?? null, verifier, redirectUri],
  );

  if (config.TIKTOK_MOCK_OAUTH) {
    return {
      state,
      auth_url: `http://127.0.0.1:${config.PORT}/api/v1/oauth/tiktok-mcp/callback?code=mock-mcp-code&state=${state}`,
    };
  }

  const cfg = await discover();
  const clientId = await ensureMcpClientId(scope);
  const auth = new URL(cfg.authorization_endpoint);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('resource', MCP_BASE);
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', redirectUri);
  auth.searchParams.set('scope', 'mcp:tt4b');
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('state', state);
  return { state, auth_url: auth.toString() };
}

/* ── 4. Exchange the authorization code for tokens ──────── */

export async function exchangeMcpCode(
  code: string,
  state: string,
): Promise<{ tokens: TikTokTokens; scope: TenantScope; redirect_back: string | null }> {
  const { rows } = await pool.query<{
    agency_id: string; client_id: string | null; user_id: string;
    redirect_back: string | null; code_verifier: string | null; redirect_uri: string | null;
  }>(
    `SELECT agency_id, client_id, user_id, redirect_back, code_verifier, redirect_uri
     FROM oauth_states
     WHERE state = $1 AND provider = 'tiktok-mcp' AND consumed_at IS NULL AND expires_at > now()`,
    [state],
  );
  const row = rows[0];
  if (!row) throw new Error('OAUTH_STATE_INVALID_OR_EXPIRED');
  await pool.query(`UPDATE oauth_states SET consumed_at = now() WHERE state = $1`, [state]);

  let tokens: TikTokTokens;
  if (config.TIKTOK_MOCK_OAUTH) {
    tokens = mockTokens();
  } else {
    const cfg = await discover();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: row.code_verifier ?? '',
      redirect_uri: row.redirect_uri ?? '',
    });
    const res = await fetch(cfg.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as {
      access_token?: string; refresh_token?: string; expires_in?: number;
      refresh_token_expires_in?: number; scope?: string; error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      throw new Error(`TIKTOK_MCP_EXCHANGE_FAILED: ${data.error_description ?? res.statusText}`);
    }
    tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? '',
      expires_in: data.expires_in ?? 86399,           // 24 hours
      refresh_expires_in: data.refresh_token_expires_in ?? 2592000, // 30 days
      scope: (data.scope ?? 'mcp:tt4b').split(' ').filter(Boolean),
      obtained_at: Date.now(),
    };
  }

  return {
    tokens,
    scope: {
      agency_id: row.agency_id,
      client_id: row.client_id ?? undefined,
      actor: { kind: 'user', id: row.user_id },
    },
    redirect_back: row.redirect_back,
  };
}

/* ── 6. Refresh the access token ────────────────────────── */

export async function refreshMcpToken(refreshToken: string): Promise<TikTokTokens> {
  if (config.TIKTOK_MOCK_OAUTH) return mockTokens();
  const cfg = await discover();
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const res = await fetch(cfg.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string; refresh_token?: string; expires_in?: number;
    refresh_token_expires_in?: number; scope?: string; error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(`TIKTOK_MCP_REFRESH_FAILED: ${data.error_description ?? res.statusText}`);
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_in: data.expires_in ?? 86399,
    refresh_expires_in: data.refresh_token_expires_in ?? 2592000,
    scope: (data.scope ?? 'mcp:tt4b').split(' ').filter(Boolean),
    obtained_at: Date.now(),
  };
}

/* ── 7. Revoke (optional) ───────────────────────────────── */

export async function revokeMcpToken(token: string): Promise<void> {
  if (config.TIKTOK_MOCK_OAUTH) return;
  const cfg = await discover();
  const body = new URLSearchParams({ token, token_type_hint: 'access_token' });
  const res = await fetch(cfg.revocation_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`TIKTOK_MCP_REVOKE_FAILED: HTTP ${res.status}`);
}

/* ── Advertiser discovery (best-effort, via MCP tools) ─── */

function extractAdvertiserIds(text: string): string[] {
  const ids = new Set<string>();
  // Object form: "advertiser_id":"123…"
  for (const m of text.matchAll(/"advertiser_id"\s*:\s*"(\d+)"/g)) ids.add(m[1]);
  // Array form: "advertiser_ids":["123…","456…"]
  for (const m of text.matchAll(/"advertiser_ids"\s*:\s*\[([^\]]*)\]/g)) {
    for (const id of m[1].matchAll(/"(\d+)"/g)) ids.add(id[1]);
  }
  return [...ids];
}

/** Best-effort list of advertisers the authorized user can act on. */
export async function listMcpAdvertisers(accessToken: string): Promise<string[]> {
  if (config.TIKTOK_MOCK_OAUTH) return ['7100000000002'];
  try {
    const mcp = new McpClient(MCP_BASE, accessToken);
    const tools = await mcp.listTools();
    // Prefer listing/search tools (zero-arg), then info/get tools as a fallback.
    const match =
      tools.find((t) => /advertiser/.test(t) && /(list|search)/.test(t)) ??
      tools.find((t) => /advertiser/.test(t) && /(get|info)/.test(t));
    if (!match) return [];
    const result = await mcp.callTool(match, {});
    return extractAdvertiserIds(result.text);
  } catch {
    return []; // never block connection registration on discovery
  }
}
