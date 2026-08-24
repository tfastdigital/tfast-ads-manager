/**
 * Google Ads gateway adapter (Phase 8, §28).
 * Same safety pipeline as TikTok/Meta. MCP endpoint: GOOGLE_MCP_URL.
 * GAQL queries flow through report ops.
 */
import type { TenantScope } from '../core/tenant.js';
import { assertClientScoped } from '../core/tenant.js';
import { McpClient } from './mcp-client.js';
import { config } from '../config.js';
import { runSafetyPipeline } from './safety-pipeline.js';
import { resolvePlatformContext } from '../services/connections.js';
import { pool } from '../db/pool.js';

export const GoogleOperations = [
  'report.account', 'report.campaign', 'report.ad_group', 'report.ad',
  'campaign.get', 'campaign.update',
  'adgroup.get', 'adgroup.update',
  'ad.get', 'ad.update',
] as const;
export type GoogleOperation = (typeof GoogleOperations)[number];

const READ_OPS: readonly GoogleOperation[] = [
  'report.account', 'report.campaign', 'report.ad_group', 'report.ad',
  'campaign.get', 'adgroup.get', 'ad.get',
];

const TOOL_KEYWORDS: Record<GoogleOperation, string[][]> = {
  'report.account': [['account', 'insight'], ['gaql']],
  'report.campaign': [['campaign', 'insight'], ['campaign', 'report']],
  'report.ad_group': [['adgroup', 'insight'], ['ad_group', 'report']],
  'report.ad': [['ad', 'insight'], ['ad', 'report']],
  'campaign.get': [['campaign', 'get'], ['campaign', 'list']],
  'campaign.update': [['campaign', 'update'], ['campaign', 'edit']],
  'adgroup.get': [['adgroup', 'get'], ['ad_group', 'get']],
  'adgroup.update': [['adgroup', 'update'], ['ad_group', 'update']],
  'ad.get': [['ad', 'get'], ['ad', 'list']],
  'ad.update': [['ad', 'update'], ['ad', 'edit']],
};

let client: McpClient | null = null;
let toolCache: Map<string, string> | null = null;

function mcpClient(): McpClient {
  const url = config.GOOGLE_MCP_URL;
  if (!url) throw new Error('GOOGLE_MCP_NOT_CONFIGURED: set GOOGLE_MCP_URL in .env');
  if (!client) client = new McpClient(url, config.GOOGLE_MCP_TOKEN);
  return client;
}

async function resolveTool(operation: GoogleOperation): Promise<string> {
  if (!toolCache) {
    const tools = await mcpClient().listTools();
    toolCache = new Map();
    for (const op of GoogleOperations) {
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
  if (!tool) throw new Error(`GOOGLE_MCP_TOOL_NOT_FOUND: no tool matched "${operation}"`);
  return tool;
}

async function callGoogleMCP(customerId: string, operation: GoogleOperation, params: Record<string, unknown>): Promise<unknown> {
  const tool = await resolveTool(operation);
  const args = params.customer_id ? params : { customer_id: customerId, ...params };
  return (await mcpClient().callTool(tool, args)).parsed;
}

function inferActionType(operation: GoogleOperation, params: Record<string, unknown>): string {
  if (operation === 'ad.update') return 'pause_underperforming_ad';
  if (operation === 'campaign.update' || operation === 'adgroup.update') {
    const hasBudget = 'budget' in params || 'amount_micros' in params;
    return hasBudget ? 'change_budget_over_25_percent' : 'create_new_ad';
  }
  return 'change_budget_over_25_percent';
}

function extractBudget(params: Record<string, unknown>) {
  const raw = (params.budget ?? params.amount_micros) as number | string | { amount_micros?: number | string } | undefined;
  if (raw == null) return null;
  const toNum = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  if (typeof raw === 'object') {
    const proposed = toNum(raw.amount_micros);
    return proposed != null ? { proposed: proposed / 1e6, currency: 'USD', description: `Budget change to ${proposed / 1e6}` } : null;
  }
  const proposed = toNum(raw);
  return proposed != null ? { proposed: proposed / 1e6, currency: 'USD', description: `Budget change to ${proposed / 1e6}` } : null;
}

export interface GoogleGatewayRequest {
  scope: TenantScope;
  operation: GoogleOperation;
  params: Record<string, unknown>;
  idempotencyKey?: string;
}

export async function googleGateway(req: GoogleGatewayRequest): Promise<{ ok: boolean; mode: 'dry_run' | 'execute'; data?: unknown; dry_run?: unknown; error?: string }> {
  assertClientScoped(req.scope);
  const ctx = await resolvePlatformContext(req.scope, 'google');
  const { rows } = await pool.query<{ permissions: string[] }>(
    `SELECT permissions FROM connections WHERE id = $1`,
    [ctx.connection_id],
  );
  const perms = rows[0]?.permissions ?? [];
  const isWrite = !READ_OPS.includes(req.operation);

  if (!isWrite) {
    try {
      return { ok: true, mode: 'execute', data: await callGoogleMCP(ctx.account_external_id, req.operation, req.params) };
    } catch (err) {
      return { ok: false, mode: 'execute', error: err instanceof Error ? err.message : String(err) };
    }
  }

  const outcome = await runSafetyPipeline({
    scope: ctx.scope,
    platform: 'google',
    connection_id: ctx.connection_id,
    account_external_id: ctx.account_external_id,
    permissions: perms,
    operation: req.operation,
    actionType: inferActionType(req.operation, req.params),
    params: req.params,
    beforeState: {},
    budget: extractBudget(req.params),
    executor: () => callGoogleMCP(ctx.account_external_id, req.operation, req.params),
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
