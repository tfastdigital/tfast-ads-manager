/**
 * Meta Ads gateway adapter (Phase 8, §28).
 * Same safety pipeline as TikTok — context resolution + executor are the
 * only Meta-specific parts. MCP endpoint: META_MCP_URL.
 * Tool names are keyword-discovered like the TikTok adapter.
 */
import { z } from 'zod';
import type { TenantScope } from '../core/tenant.js';
import { assertClientScoped } from '../core/tenant.js';
import { McpClient } from './mcp-client.js';
import { config } from '../config.js';
import { runSafetyPipeline, type MutationOutcome } from './safety-pipeline.js';
import { resolvePlatformContext } from '../services/connections.js';
import { pool } from '../db/pool.js';

export const MetaOperations = [
  'report.account', 'report.campaign', 'report.adset', 'report.ad',
  'campaign.get', 'campaign.update', 'campaign.create',
  'adset.get', 'adset.update', 'adset.create',
  'ad.get', 'ad.update', 'ad.create',
] as const;
export type MetaOperation = (typeof MetaOperations)[number];

const READ_OPS: readonly MetaOperation[] = [
  'report.account', 'report.campaign', 'report.adset', 'report.ad',
  'campaign.get', 'adset.get', 'ad.get',
];

const TOOL_KEYWORDS: Record<MetaOperation, string[][]> = {
  'report.account': [['account', 'insight'], ['insight', 'account']],
  'report.campaign': [['campaign', 'insight'], ['insight', 'campaign']],
  'report.adset': [['adset', 'insight'], ['insight', 'adset']],
  'report.ad': [['ad', 'insight'], ['insight', 'ad']],
  'campaign.get': [['campaign', 'get'], ['campaign', 'list'], ['campaign', 'detail']],
  'campaign.update': [['campaign', 'update']],
  'campaign.create': [['campaign', 'create']],
  'adset.get': [['adset', 'get'], ['adset', 'list']],
  'adset.update': [['adset', 'update']],
  'adset.create': [['adset', 'create']],
  'ad.get': [['ad', 'get'], ['ad', 'list']],
  'ad.update': [['ad', 'update']],
  'ad.create': [['ad', 'create']],
};

let client: McpClient | null = null;
let toolCache: Map<string, string> | null = null;

function mcpClient(): McpClient {
  const url = config.META_MCP_URL;
  if (!url) throw new Error('META_MCP_NOT_CONFIGURED: set META_MCP_URL in .env');
  if (!client) client = new McpClient(url, config.META_MCP_TOKEN);
  return client;
}

async function resolveTool(operation: MetaOperation): Promise<string> {
  if (!toolCache) {
    const tools = await mcpClient().listTools();
    toolCache = new Map();
    for (const op of MetaOperations) {
      let best = ''; let bestScore = 0;
      for (const tool of tools) {
        const normalized = tool.toLowerCase().replace(/[^a-z0-9]/g, '');
        let score = 0;
        for (const group of TOOL_KEYWORDS[op]) {
          if (normalized.includes(group.join(''))) score += group.join('').length;
        }
        if (score > bestScore) { bestScore = score; best = tool; }
      }
      if (best) toolCache.set(op, best);
    }
  }
  const tool = toolCache.get(operation);
  if (!tool) throw new Error(`META_MCP_TOOL_NOT_FOUND: no tool matched "${operation}"`);
  return tool;
}

async function callMetaMCP(accountExternalId: string, operation: MetaOperation, params: Record<string, unknown>): Promise<unknown> {
  const tool = await resolveTool(operation);
  const args = params.ad_account_id ? params : { ad_account_id: accountExternalId, ...params };
  return (await mcpClient().callTool(tool, args)).parsed;
}

function inferActionType(operation: MetaOperation, params: Record<string, unknown>): string {
  if (operation === 'ad.update') return 'pause_underperforming_ad';
  if (operation === 'campaign.create' || operation === 'adset.create') return 'launch_campaign';
  if (operation === 'ad.create') return 'create_new_ad';
  if (operation === 'campaign.update' || operation === 'adset.update') {
    const hasBudget = 'budget' in params || 'daily_budget' in params;
    return hasBudget ? 'change_budget_over_25_percent' : 'create_new_ad';
  }
  return 'change_budget_over_25_percent';
}

function extractBudget(params: Record<string, unknown>) {
  const budget = (params.budget ?? params.daily_budget) as number | string | { amount?: number | string; daily_budget?: number | string } | undefined;
  if (budget == null) return null;
  const toNum = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  if (typeof budget === 'object') {
    const proposed = toNum(budget.amount ?? budget.daily_budget);
    return proposed != null ? { proposed, currency: (params.currency as string) ?? 'USD', description: `Budget change to ${proposed}` } : null;
  }
  const proposed = toNum(budget);
  return proposed != null ? { proposed, currency: (params.currency as string) ?? 'USD', description: `Budget change to ${proposed}` } : null;
}

export interface MetaGatewayRequest {
  scope: TenantScope;
  operation: MetaOperation;
  params: Record<string, unknown>;
  idempotencyKey?: string;
}

export async function metaGateway(req: MetaGatewayRequest): Promise<{ ok: boolean; mode: 'dry_run' | 'execute'; data?: unknown; dry_run?: unknown; error?: string }> {
  assertClientScoped(req.scope);
  const ctx = await resolvePlatformContext(req.scope, 'meta');
  const perms = await permissionsForMeta(ctx.connection_id);
  const isWrite = !READ_OPS.includes(req.operation);

  if (!isWrite) {
    try {
      return { ok: true, mode: 'execute', data: await callMetaMCP(ctx.account_external_id, req.operation, req.params) };
    } catch (err) {
      return { ok: false, mode: 'execute', error: err instanceof Error ? err.message : String(err) };
    }
  }

  const outcome = await runSafetyPipeline({
    scope: ctx.scope,
    platform: 'meta',
    connection_id: ctx.connection_id,
    account_external_id: ctx.account_external_id,
    permissions: perms,
    operation: req.operation,
    actionType: inferActionType(req.operation, req.params),
    params: req.params,
    beforeState: {},
    budget: extractBudget(req.params),
    executor: () => callMetaMCP(ctx.account_external_id, req.operation, req.params),
    idempotencyKey: req.idempotencyKey,
  });
  return {
    ok: outcome.ok,
    mode: outcome.executed ? 'execute' : 'dry_run',
    data: outcome.executed ? outcome.execution_result : undefined,
    dry_run: outcome.dry_run,
    error: outcome.error,
  };
}

async function permissionsForMeta(connectionId: string): Promise<string[]> {
  const { rows } = await pool.query<{ permissions: string[] }>(
    `SELECT permissions FROM connections WHERE id = $1`,
    [connectionId],
  );
  return rows[0]?.permissions ?? [];
}
