/**
 * API routes — Phase 1b/2 surface.
 * Every route resolves the tenant from the verified session (req.session),
 * never from client input. RBAC via roleAtLeast.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signToken, verifyToken, verifyPassword, roleAtLeast } from './http/auth.js';
import { listConnections, createConnection, setConnectionStatus, ConnectionInputSchema } from './services/connections.js';
import { getBrain, updateBrainSection, buildBrainContext, BRAIN_SECTIONS, BrainContentSchema } from './services/client-brain.js';
import { remember, recall, promoteToAgencyKnowledge, recallAgencyKnowledge } from './services/memory.js';
import { commanderAnswer, portfolioSnapshot } from './agents/commander.js';
import { pool } from './db/pool.js';
import type { TenantScope } from './core/tenant.js';
import {
  tiktokGateway, executeTikTokMutation, approveAndExecuteMutation,
  listPendingApprovals, probeTikTokMCP, TikTokOperations, type TikTokOperation,
} from './mcp/tiktok-gateway.js';
import { tiktokConnectionLookup } from './services/connections.js';
import { syncTikTokReports } from './jobs/tiktok-sync.js';
import { metaGateway, MetaOperations, type MetaOperation } from './mcp/meta-gateway.js';
import { googleGateway, GoogleOperations, type GoogleOperation } from './mcp/google-gateway.js';
import { runMorningBrief, listBriefs } from './jobs/morning-brief.js';
import { runResearch, ResearchInputSchema } from './jobs/research.js';
import {
  extractCreativeAttributes, analyzeCreativeBatch, correlateCreativeAttributes,
  topHooks, rememberCreativePatterns, CreativeAnalyzeInputSchema,
} from './jobs/creative-intelligence.js';
import { createExperiment, listExperiments, evaluateExperiment, ExperimentInputSchema } from './jobs/experiments.js';
import {
  ingestLead, transitionLead, ingestRevenue, attributionReport, profitReport,
  LeadInputSchema, LeadEventSchema, RevenueInputSchema,
} from './services/business.js';
import {
  createOAuthState, exchangeCode, getAdvertiserIds, storeTokens, consumeOAuthState,
  getAccessToken, CallbackQuerySchema,
} from './providers/tiktok-oauth.js';
import { startMcpAuth, exchangeMcpCode, listMcpAdvertisers } from './providers/tiktok-mcp-oauth.js';

function clientScope(req: { session: NonNullable<import('fastify').FastifyRequest['session']> }, clientId: string): TenantScope {
  return {
    agency_id: req.session.agency_id,
    client_id: clientId,
    actor: { kind: 'user', id: req.session.user_id },
  };
}

const DevLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ── TikTok OAuth (§9 — the production connection method) ─
  // Step 1: dashboard requests an auth URL. State binds tenant + user.
  app.get('/api/v1/clients/:clientId/connections/tiktok/oauth/start', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const scope: TenantScope = { agency_id: s.agency_id, client_id: clientId, actor: { kind: 'user', id: s.user_id } };
    const { state, auth_url } = await createOAuthState(scope, `/?client=${clientId}&tab=connections`);
    return { state, auth_url };
  });

  // Step 2: TikTok redirects here (PUBLIC route — validated by state).
  app.get('/api/v1/oauth/tiktok/callback', async (req, reply) => {
    try {
      const query = CallbackQuerySchema.parse(req.query);
      if (query.error) {
        return reply.redirect('/?oauth=denied');
      }
      const stateInfo = await consumeOAuthState(query.state, 'tiktok');
      const tokens = await exchangeCode(query.code);
      const advertiserIds = await getAdvertiserIds(tokens.access_token);

      // Store encrypted tokens server-side; registry gets references only.
      const reference = `tiktok:oauth:${query.state}`;
      const scope: TenantScope = {
        agency_id: stateInfo.agency_id,
        client_id: stateInfo.client_id ?? undefined,
        actor: { kind: 'user', id: stateInfo.user_id },
      };
      await storeTokens(scope, reference, tokens);
      // Self-check: prove the encrypt/decrypt roundtrip works before redirecting.
      await getAccessToken(scope, reference);

      // Auto-register ACTIVE connection(s) — one per advertiser id.
      const externalAccountId = advertiserIds[0] ?? `tiktok-${query.state.slice(0, 8)}`;
      await pool.query(
        `INSERT INTO connections
           (agency_id, client_id, provider, external_account_id, advertiser_id,
            credential_reference, permissions, status, last_verified_at)
         VALUES ($1, $2, 'tiktok', $3, $4, $5, '["tiktok:read","tiktok:write"]', 'active', now())
         ON CONFLICT (client_id, provider, external_account_id) DO UPDATE
           SET credential_reference = EXCLUDED.credential_reference,
               advertiser_id = EXCLUDED.advertiser_id,
               status = 'active',
               last_verified_at = now(),
               updated_at = now()`,
        [stateInfo.agency_id, stateInfo.client_id, externalAccountId, advertiserIds[0] ?? externalAccountId, reference],
      );

      const landing = stateInfo.redirect_back ?? '/';
      return reply.redirect(`${landing}${landing.includes('?') ? '&' : '?'}oauth=connected&advertisers=${advertiserIds.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Browser navigation (e.g. a restored popup replaying a consumed state)
      // gets a friendly redirect; API clients keep the JSON error.
      if (req.headers.accept?.includes('text/html')) {
        return reply.redirect(`/?oauth=error&reason=${encodeURIComponent(message)}`);
      }
      return reply.code(400).send({ error: message });
    }
  });

  // ── TikTok MCP Server OAuth (official custom-agent flow: DCR + PKCE) ─
  // Docs: business-api.tiktok.com/portal/docs/how-to-connect-a-custom-agent-to-tiktok-for-business-mcp-server
  app.get('/api/v1/clients/:clientId/connections/tiktok/mcp/oauth/start', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const scope: TenantScope = { agency_id: s.agency_id, client_id: clientId, actor: { kind: 'user', id: s.user_id } };
    const { state, auth_url } = await startMcpAuth(scope, `/?client=${clientId}&tab=connections`);
    return { state, auth_url };
  });

  // PUBLIC callback — validated by the PKCE state (one-time use, 10 min).
  app.get('/api/v1/oauth/tiktok-mcp/callback', async (req, reply) => {
    try {
      const query = CallbackQuerySchema.parse(req.query);
      if (query.error) {
        return reply.redirect('/?oauth=denied');
      }
      const { tokens, scope, redirect_back } = await exchangeMcpCode(query.code, query.state);

      // Encrypted server-side storage; registry gets a reference only.
      const reference = `tiktok-mcp:oauth:${query.state}`;
      await storeTokens(scope, reference, tokens);
      // Self-check: prove the encrypt/decrypt roundtrip works before redirecting.
      await getAccessToken(scope, reference);
      const advertisers = await listMcpAdvertisers(tokens.access_token);
      const externalAccountId = advertisers[0] ?? `mcp-${query.state.slice(0, 8)}`;

      await pool.query(
        `INSERT INTO connections
           (agency_id, client_id, provider, external_account_id, advertiser_id,
            credential_reference, permissions, status, last_verified_at)
         VALUES ($1, $2, 'tiktok', $3, $4, $5, '["tiktok:read","tiktok:write"]', 'active', now())
         ON CONFLICT (client_id, provider, external_account_id) DO UPDATE
           SET credential_reference = EXCLUDED.credential_reference,
               advertiser_id = EXCLUDED.advertiser_id,
               status = 'active',
               last_verified_at = now(),
               updated_at = now()`,
        [scope.agency_id, scope.client_id ?? null, externalAccountId, advertisers[0] ?? externalAccountId, reference],
      );

      const landing = redirect_back ?? '/';
      return reply.redirect(`${landing}${landing.includes('?') ? '&' : '?'}oauth=connected&provider=tiktok-mcp&advertisers=${advertisers.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Browser navigation (e.g. a restored popup replaying a consumed state)
      // gets a friendly redirect; API clients keep the JSON error.
      if (req.headers.accept?.includes('text/html')) {
        return reply.redirect(`/?oauth=error&reason=${encodeURIComponent(message)}`);
      }
      return reply.code(400).send({ error: message });
    }
  });

  // ── Auth ────────────────────────────────────────────────
  app.post('/api/v1/auth/dev-login', async (req, reply) => {
    if (process.env.NODE_ENV === 'production') return reply.code(404).send({ error: 'NOT_FOUND' });
    const input = DevLoginSchema.parse(req.body);
    const result = await pool.query<{
      user_id: string;
      agency_id: string;
      role: 'owner' | 'admin' | 'media_buyer' | 'analyst' | 'viewer';
      password_hash: string | null;
    }>(
      `SELECT u.id AS user_id, am.agency_id, am.role, u.password_hash
       FROM users u
       JOIN agency_members am ON am.user_id = u.id
       WHERE lower(u.email) = lower($1)
       ORDER BY am.created_at ASC
       LIMIT 1`,
      [input.email],
    );
    const account = result.rows[0];
    if (!account || !verifyPassword(input.password, account.password_hash)) {
      return reply.code(401).send({ error: 'Incorrect email or password.' });
    }
    const token = signToken({
      user_id: account.user_id,
      agency_id: account.agency_id,
      role: account.role,
    });
    return { token, note: 'Development login only. Disabled in production.' };
  });

  app.get('/api/v1/auth/session', async (req) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return { session: token ? verifyToken(token) : null };
  });

  // ── Portfolio (Agency Commander) ────────────────────────
  app.get('/api/v1/portfolio/summary', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return portfolioSnapshot({ agency_id: s.agency_id, actor: { kind: 'user', id: s.user_id } });
  });

  app.post('/api/v1/ai/ask', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { question } = z.object({ question: z.string().min(1) }).parse(req.body);
    return commanderAnswer({ agency_id: s.agency_id, actor: { kind: 'user', id: s.user_id } }, question);
  });

  // ── Clients ─────────────────────────────────────────────
  app.get('/api/v1/clients', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { rows } = await pool.query(
      `SELECT id, name, slug, status, timezone, created_at FROM clients WHERE agency_id = $1 ORDER BY name`,
      [s.agency_id],
    );
    return { clients: rows };
  });

  app.post('/api/v1/clients', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'admin')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { name, slug, timezone } = z
      .object({ name: z.string().min(1), slug: z.string().min(1), timezone: z.string().default('UTC') })
      .parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO clients (agency_id, name, slug, timezone) VALUES ($1, $2, $3, $4) RETURNING id, name, slug, status, timezone`,
      [s.agency_id, name, slug, timezone],
    );
    return reply.code(201).send(rows[0]);
  });

  // ── Connections (registry) ──────────────────────────────
  app.get('/api/v1/clients/:clientId/connections', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    return { connections: await listConnections(clientScope(req as never, clientId)) };
  });

  app.post('/api/v1/clients/:clientId/connections', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const input = ConnectionInputSchema.parse(req.body);
    const row = await createConnection(clientScope(req as never, clientId), input);
    return reply.code(201).send(row);
  });

  app.post('/api/v1/clients/:clientId/connections/:connectionId/status', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId, connectionId } = z
      .object({ clientId: z.string().uuid(), connectionId: z.string().uuid() })
      .parse(req.params);
    const { status } = z.object({ status: z.enum(['active', 'revoked']) }).parse(req.body);
    await setConnectionStatus(clientScope(req as never, clientId), connectionId, status);
    return { ok: true };
  });

  // ── Client Brain ────────────────────────────────────────
  app.get('/api/v1/clients/:clientId/brain', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const brain = await getBrain(clientScope(req as never, clientId));
    return { brain: Object.fromEntries(brain) };
  });

  app.put('/api/v1/clients/:clientId/brain/:section', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId, section } = z
      .object({ clientId: z.string().uuid(), section: z.enum(BRAIN_SECTIONS) })
      .parse(req.params);
    const content = BrainContentSchema.parse(req.body);
    const version = await updateBrainSection(clientScope(req as never, clientId), section, content, s.user_id);
    return { ok: true, version };
  });

  // ── Memory ──────────────────────────────────────────────
  app.post('/api/v1/clients/:clientId/memory', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const input = z
      .object({ kind: z.enum(['fact', 'observation', 'hypothesis', 'lesson']), content: z.string().min(1), importance: z.number().int().min(1).max(10).optional() })
      .parse(req.body);
    const id = await remember(clientScope(req as never, clientId), input);
    return reply.code(201).send({ id });
  });

  app.post('/api/v1/clients/:clientId/memory/recall', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const { query, k } = z.object({ query: z.string().min(1), k: z.number().int().min(1).max(20).default(5) }).parse(req.body);
    return { memories: await recall(clientScope(req as never, clientId), query, k) };
  });

  app.post('/api/v1/agency/knowledge', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'admin')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const input = z
      .object({
        client_id: z.string().uuid(),
        lesson_id: z.string().uuid(),
        topic: z.string().min(1),
        pattern: z.record(z.string(), z.unknown()),
        anonymized_content: z.string().min(1),
      })
      .parse(req.body);
    const id = await promoteToAgencyKnowledge(clientScope(req as never, input.client_id), input);
    return reply.code(201).send({ id });
  });

  app.post('/api/v1/agency/knowledge/recall', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { query, k } = z.object({ query: z.string().min(1), k: z.number().int().min(1).max(20).default(5) }).parse(req.body);
    return { knowledge: await recallAgencyKnowledge({ agency_id: s.agency_id, actor: { kind: 'user', id: s.user_id } }, query, k) };
  });

  // ── Client Brain context (prompt-ready, for debugging) ──
  app.get('/api/v1/clients/:clientId/brain/context', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    return { context: await buildBrainContext(clientScope(req as never, clientId)) };
  });

  // ── TikTok Tool Gateway (Phase 3) ──────────────────────
  app.post('/api/v1/clients/:clientId/tiktok/report', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const { operation, params } = z
      .object({ operation: z.string(), params: z.record(z.string(), z.unknown()).default({}) })
      .parse(req.body);
    if (!TikTokOperations.includes(operation as TikTokOperation)) {
      return reply.code(400).send({ error: 'UNKNOWN_OPERATION', allowed: TikTokOperations });
    }
    const res = await tiktokGateway(tiktokConnectionLookup, {
      scope: clientScope(req as never, clientId),
      operation: operation as TikTokOperation,
      params,
    });
    return res.ok ? res : reply.code(502).send(res);
  });

  app.get('/api/v1/clients/:clientId/tiktok/health', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const result = await probeTikTokMCP(tiktokConnectionLookup, clientScope(req as never, clientId));
    return reply.code(result.ok ? 200 : 503).send(result);
  });

  app.post('/api/v1/clients/:clientId/tiktok/mutation', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const { operation, params } = z
      .object({ operation: z.string(), params: z.record(z.string(), z.unknown()).default({}) })
      .parse(req.body);
    if (!TikTokOperations.includes(operation as TikTokOperation)) {
      return reply.code(400).send({ error: 'UNKNOWN_OPERATION', allowed: TikTokOperations });
    }
    const outcome = await executeTikTokMutation(tiktokConnectionLookup, {
      scope: clientScope(req as never, clientId),
      operation: operation as TikTokOperation,
      params,
    });
    return reply.code(outcome.ok ? 200 : 502).send(outcome);
  });

  // ── Approvals (§13) ────────────────────────────────────
  app.get('/api/v1/clients/:clientId/approvals', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    return { approvals: await listPendingApprovals(clientScope(req as never, clientId)) };
  });

  app.post('/api/v1/clients/:clientId/approvals/:approvalId/approve', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId, approvalId } = z
      .object({ clientId: z.string().uuid(), approvalId: z.string().uuid() })
      .parse(req.params);
    const outcome = await approveAndExecuteMutation(
      tiktokConnectionLookup,
      approvalId,
      clientScope(req as never, clientId),
      { user_id: s.user_id, role: s.role },
    );
    return reply.code(outcome.ok ? 200 : 403).send(outcome);
  });

  // ── Jobs ───────────────────────────────────────────────
  app.post('/api/v1/jobs/tiktok-sync', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { client_id, days } = z
      .object({ client_id: z.string().uuid().optional(), days: z.number().int().min(1).max(90).default(30) })
      .parse(req.body ?? {});
    const summary = await syncTikTokReports(
      { agency_id: s.agency_id, client_id: client_id, actor: { kind: 'user', id: s.user_id } },
      days,
    );
    return summary;
  });

  // ── Morning Brief (§18) ────────────────────────────────
  app.post('/api/v1/jobs/morning-brief', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { client_id, include_ai_recommendations } = z
      .object({
        client_id: z.string().uuid().optional(),
        include_ai_recommendations: z.boolean().default(false),
      })
      .parse(req.body ?? {});
    return runMorningBrief(
      { agency_id: s.agency_id, client_id: client_id, actor: { kind: 'user', id: s.user_id } },
      { client_id, includeAiRecommendations: include_ai_recommendations },
    );
  });

  app.get('/api/v1/briefs', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    return { briefs: await listBriefs({ agency_id: s.agency_id, actor: { kind: 'user', id: s.user_id } }) };
  });

  app.get('/api/v1/briefs/:briefId', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { briefId } = z.object({ briefId: z.string().uuid() }).parse(req.params);
    const { rows } = await pool.query(
      `SELECT id, client_id, rule_name, findings, severity, created_at
       FROM automation_runs
       WHERE id = $1 AND agency_id = $2 AND rule_name = 'morning_brief'`,
      [briefId, s.agency_id],
    );
    return { brief: rows[0] ?? null };
  });

  // ── Research (Phase 4, API Direct) ─────────────────────
  app.post('/api/v1/clients/:clientId/research/run', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const input = ResearchInputSchema.parse(req.body);
    return runResearch(clientScope(req as never, clientId), input);
  });

  app.get('/api/v1/clients/:clientId/research', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const { rows } = await pool.query(
      `SELECT id, platform, kind, external_url, collected_at
       FROM research_items
       WHERE agency_id = $1 AND client_id = $2
       ORDER BY collected_at DESC
       LIMIT 100`,
      [s.agency_id, clientId],
    );
    return { items: rows };
  });

  // ── Meta / Google gateways (Phase 8) ───────────────────
  app.post('/api/v1/clients/:clientId/meta/:mode', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId, mode } = z
      .object({ clientId: z.string().uuid(), mode: z.enum(['report', 'mutation']) })
      .parse(req.params);
    const { operation, params } = z
      .object({ operation: z.string(), params: z.record(z.string(), z.unknown()).default({}) })
      .parse(req.body);
    if (!MetaOperations.includes(operation as MetaOperation)) {
      return reply.code(400).send({ error: 'UNKNOWN_OPERATION', allowed: MetaOperations });
    }
    if (mode === 'mutation' && !roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const res = await metaGateway({
      scope: clientScope(req as never, clientId),
      operation: operation as MetaOperation,
      params,
    });
    return res.ok ? res : reply.code(502).send(res);
  });

  app.post('/api/v1/clients/:clientId/google/:mode', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId, mode } = z
      .object({ clientId: z.string().uuid(), mode: z.enum(['report', 'mutation']) })
      .parse(req.params);
    const { operation, params } = z
      .object({ operation: z.string(), params: z.record(z.string(), z.unknown()).default({}) })
      .parse(req.body);
    if (!GoogleOperations.includes(operation as GoogleOperation)) {
      return reply.code(400).send({ error: 'UNKNOWN_OPERATION', allowed: GoogleOperations });
    }
    if (mode === 'mutation' && !roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const res = await googleGateway({
      scope: clientScope(req as never, clientId),
      operation: operation as GoogleOperation,
      params,
    });
    return res.ok ? res : reply.code(502).send(res);
  });

  // ── Creative Intelligence (Phase 6, §11) ───────────────
  app.post('/api/v1/clients/:clientId/creative/analyze', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        items: z.array(CreativeAnalyzeInputSchema).optional(),
        item: CreativeAnalyzeInputSchema.optional(),
      })
      .parse(req.body);
    const scope = clientScope(req as never, clientId);
    if (body.item) return extractCreativeAttributes(scope, body.item);
    if (body.items?.length) return analyzeCreativeBatch(scope, body.items);
    return reply.code(400).send({ error: 'Provide item or items[]' });
  });

  app.get('/api/v1/clients/:clientId/creative/intelligence', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }).parse(req.query);
    const scope = clientScope(req as never, clientId);
    return {
      correlation: await correlateCreativeAttributes(scope, days),
      top_hooks: await topHooks(scope, days),
    };
  });

  app.post('/api/v1/clients/:clientId/creative/remember-patterns', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const memoryId = await rememberCreativePatterns(clientScope(req as never, clientId));
    return { memory_id: memoryId };
  });

  // ── Experiment Engine (Phase 6, §12) ───────────────────
  app.post('/api/v1/clients/:clientId/experiments', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'media_buyer')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const input = ExperimentInputSchema.parse(req.body);
    return reply.code(201).send(await createExperiment(clientScope(req as never, clientId), input));
  });

  app.get('/api/v1/clients/:clientId/experiments', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    return { experiments: await listExperiments(clientScope(req as never, clientId)) };
  });

  app.post('/api/v1/clients/:clientId/experiments/:experimentId/evaluate', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId, experimentId } = z
      .object({ clientId: z.string().uuid(), experimentId: z.string().uuid() })
      .parse(req.params);
    return evaluateExperiment(clientScope(req as never, clientId), experimentId);
  });

  // ── Business Outcomes (Phase 7, §19–20) ────────────────
  app.post('/api/v1/clients/:clientId/leads', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const input = LeadInputSchema.parse(req.body);
    return reply.code(201).send(await ingestLead(clientScope(req as never, clientId), input));
  });

  app.post('/api/v1/clients/:clientId/leads/:leadId/events', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId, leadId } = z.object({ clientId: z.string().uuid(), leadId: z.string().uuid() }).parse(req.params);
    const event = LeadEventSchema.parse(req.body);
    return transitionLead(clientScope(req as never, clientId), leadId, event);
  });

  app.post('/api/v1/clients/:clientId/revenue', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    if (!roleAtLeast(s.role, 'analyst')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const input = RevenueInputSchema.parse(req.body);
    return reply.code(201).send(await ingestRevenue(clientScope(req as never, clientId), input));
  });

  app.get('/api/v1/clients/:clientId/attribution', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(req.query);
    return { campaigns: await attributionReport(clientScope(req as never, clientId), days) };
  });

  app.get('/api/v1/clients/:clientId/profit', async (req, reply) => {
    const s = req.session;
    if (!s) return reply.code(401).send({ error: 'UNAUTHORIZED' });
    const { clientId } = z.object({ clientId: z.string().uuid() }).parse(req.params);
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(req.query);
    return { campaigns: await profitReport(clientScope(req as never, clientId), days) };
  });
}
