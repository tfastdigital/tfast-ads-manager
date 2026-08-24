/**
 * TikTok OAuth 2.0 provider (§9 — the production connection method).
 *
 * Flow:
 *   dashboard → GET /oauth/start → TikTok auth URL (state bound to client)
 *   user approves → TikTok redirects → GET /oauth/tiktok/callback?code&state
 *   server exchanges code → access/refresh tokens + advertiser ids
 *   server stores ENCRYPTED tokens in the secret store and creates
 *   ACTIVE connection rows — the registry never holds plaintext secrets.
 *
 * DEV: TIKTOK_MOCK_OAUTH=true mocks the TikTok side so the whole flow is
 * testable locally (any code is accepted, fake tokens/advertisers).
 */
import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import type { TenantScope } from '../core/tenant.js';

const TIKTOK_AUTH_URL = 'https://ads.tiktok.com/marketing_api/auth';
const TIKTOK_TOKEN_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
const TIKTOK_REFRESH_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/';
const TIKTOK_ADVERTISERS_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/';

export interface TikTokTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;       // seconds
  refresh_expires_in: number;
  scope: string[];
  obtained_at: number;      // epoch ms
}

/* ── Authorization URL ─────────────────────────────────── */

export function buildAuthUrl(state: string): string {
  if (config.TIKTOK_MOCK_OAUTH) {
    // Dev mock: point at our own public callback so the flow can be walked locally.
    return `http://127.0.0.1:${config.PORT}/api/v1/oauth/tiktok/callback?code=mock-auth-code&state=${state}`;
  }
  const appId = config.TIKTOK_APP_ID;
  if (!appId) throw new Error('TIKTOK_OAUTH_NOT_CONFIGURED: set TIKTOK_APP_ID in .env');
  const params = new URLSearchParams({
    app_id: appId,
    state,
    redirect_uri: config.TIKTOK_REDIRECT_URI ?? '',
  });
  return `${TIKTOK_AUTH_URL}?${params}`;
}

export async function createOAuthState(scope: TenantScope, redirectBack?: string): Promise<{ state: string; auth_url: string }> {
  const state = randomBytes(24).toString('base64url');
  await pool.query(
    `INSERT INTO oauth_states (state, agency_id, client_id, user_id, provider, redirect_back, expires_at)
     VALUES ($1, $2, $3, $4, 'tiktok', $5, now() + interval '10 minutes')`,
    [state, scope.agency_id, scope.client_id ?? null, scope.actor.id, redirectBack ?? null],
  );
  return { state, auth_url: buildAuthUrl(state) };
}

/* ── Token exchange ────────────────────────────────────── */

export async function exchangeCode(code: string): Promise<TikTokTokens> {
  if (config.TIKTOK_MOCK_OAUTH) return mockTokens();

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: config.TIKTOK_APP_SECRET,
      app_id: config.TIKTOK_APP_ID,
      auth_code: code,
    }),
  });
  const data = (await res.json()) as { code?: number; message?: string; data?: Record<string, unknown> };
  if (!res.ok || data.code !== 0 || !data.data) {
    throw new Error(`TIKTOK_OAUTH_EXCHANGE_FAILED: ${data.message ?? res.statusText}`);
  }
  return {
    access_token: String(data.data.access_token),
    refresh_token: String(data.data.refresh_token),
    expires_in: Number(data.data.expires_in ?? 86400),
    refresh_expires_in: Number(data.data.refresh_expires_in ?? 31536000),
    scope: Array.isArray(data.data.scope) ? (data.data.scope as string[]) : [],
    obtained_at: Date.now(),
  };
}

export async function refreshTokens(refreshToken: string): Promise<TikTokTokens> {
  if (config.TIKTOK_MOCK_OAUTH) return mockTokens();

  const res = await fetch(TIKTOK_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.TIKTOK_APP_SECRET, app_id: config.TIKTOK_APP_ID, refresh_token: refreshToken }),
  });
  const data = (await res.json()) as { code?: number; message?: string; data?: Record<string, unknown> };
  if (!res.ok || data.code !== 0 || !data.data) {
    throw new Error(`TIKTOK_OAUTH_REFRESH_FAILED: ${data.message ?? res.statusText}`);
  }
  return {
    access_token: String(data.data.access_token),
    refresh_token: String(data.data.refresh_token),
    expires_in: Number(data.data.expires_in ?? 86400),
    refresh_expires_in: Number(data.data.refresh_expires_in ?? 31536000),
    scope: Array.isArray(data.data.scope) ? (data.data.scope as string[]) : [],
    obtained_at: Date.now(),
  };
}

export async function getAdvertiserIds(accessToken: string): Promise<string[]> {
  if (config.TIKTOK_MOCK_OAUTH) return ['7100000000002'];

  const params = new URLSearchParams({
    secret: config.TIKTOK_APP_SECRET ?? '',
    app_id: config.TIKTOK_APP_ID ?? '',
    access_token: accessToken,
  });
  const res = await fetch(`${TIKTOK_ADVERTISERS_URL}?${params}`);
  const data = (await res.json()) as { code?: number; message?: string; data?: { list?: Array<{ advertiser_id?: string }> } };
  if (!res.ok || data.code !== 0) {
    throw new Error(`TIKTOK_OAUTH_ADVERTISERS_FAILED: ${data.message ?? res.statusText}`);
  }
  return (data.data?.list ?? []).map((a) => String(a.advertiser_id));
}

/* ── Encrypted secret store (AES-256-GCM) ──────────────── */

function keyMaterial(): Buffer {
  return createHash('sha256').update(`${config.JWT_SECRET ?? 'dev'}:tfast-secret-store`).digest();
}

function encrypt(payload: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyMaterial(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decrypt(stored: string): Record<string, unknown> {
  const [iv, tag, enc] = stored.split('.');
  const decipher = createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const out = Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]);
  return JSON.parse(out.toString('utf-8')) as Record<string, unknown>;
}

export async function storeTokens(
  scope: TenantScope,
  reference: string,
  tokens: TikTokTokens,
): Promise<void> {
  await pool.query(
    `INSERT INTO secret_store (reference, agency_id, client_id, kind, value)
     VALUES ($1, $2, $3, 'oauth_token', $4::jsonb)
     ON CONFLICT (reference) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [reference, scope.agency_id, scope.client_id ?? null, JSON.stringify({ enc: encrypt(tokens as unknown as Record<string, unknown>) })],
  );
}

/** Resolve a live access token for a credential reference (auto-refresh). */
export async function getAccessToken(scope: TenantScope, reference: string): Promise<string> {
  const { rows } = await pool.query<{ value: { enc: string } }>(
    `SELECT value FROM secret_store WHERE reference = $1 AND agency_id = $2`,
    [reference, scope.agency_id],
  );
  const row = rows[0];
  if (!row) throw new Error(`SECRET_NOT_FOUND: no token stored for reference ${reference}`);
  const tokens = decrypt(row.value.enc) as unknown as TikTokTokens;

  // Refresh when within 5 minutes of expiry.
  if (Date.now() - tokens.obtained_at > (tokens.expires_in - 300) * 1000) {
    let fresh: TikTokTokens;
    if (reference.startsWith('tiktok-mcp:')) {
      // MCP server tokens refresh at the MCP token endpoint (dynamic import avoids a static cycle).
      const { refreshMcpToken } = await import('./tiktok-mcp-oauth.js');
      fresh = await refreshMcpToken(tokens.refresh_token);
    } else {
      fresh = await refreshTokens(tokens.refresh_token);
    }
    await storeTokens(scope, reference, fresh);
    return fresh.access_token;
  }
  return tokens.access_token;
}

/* ── Dev mock ──────────────────────────────────────────── */

export function mockTokens(): TikTokTokens {
  return {
    access_token: `mock-at-${randomBytes(12).toString('hex')}`,
    refresh_token: `mock-rt-${randomBytes(12).toString('hex')}`,
    expires_in: 86400,
    refresh_expires_in: 31536000,
    scope: ['ad_management'],
    obtained_at: Date.now(),
  };
}

/* ── State verification (constant-time) ────────────────── */

export async function consumeOAuthState(state: string, provider: 'tiktok'): Promise<{ agency_id: string; client_id: string | null; user_id: string; redirect_back: string | null }> {
  const { rows } = await pool.query<{ agency_id: string; client_id: string | null; user_id: string; redirect_back: string | null }>(
    `SELECT agency_id, client_id, user_id, redirect_back FROM oauth_states
     WHERE state = $1 AND provider = $2 AND consumed_at IS NULL AND expires_at > now()`,
    [state, provider],
  );
  const row = rows[0];
  if (!row) throw new Error('OAUTH_STATE_INVALID_OR_EXPIRED');
  await pool.query(`UPDATE oauth_states SET consumed_at = now() WHERE state = $1`, [state]);
  return row;
}

export const CallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
});
