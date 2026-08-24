/**
 * Agent runner — executes a registered specialist agent.
 * Structured outputs only: every response is parsed against the agent's
 * zod output schema and recorded in agent_runs.
 */
import { z } from 'zod';
import { getAgent } from './registry.js';
import { complete, type ProviderId, type TaskKind } from '../providers/router.js';
import { pool } from '../db/pool.js';
import type { TenantScope } from '../core/tenant.js';
import type OpenAI from 'openai';

export interface RunAgentOptions {
  name: string;
  scope: TenantScope;
  prompt: string;
  system?: string;
  provider?: ProviderId; // omit for auto-routing
  record?: boolean;     // write agent_runs row (default true)
  imageUrl?: string;    // multimodal creative analysis (OpenAI vision)
  schema?: z.ZodTypeAny; // per-call output schema override (defaults to the registry schema)
}

const DEFAULT_SYSTEM =
  'You are a specialist agent in TFast Ads Manager, the AI-powered advertising command center ' +
  'for TFast Digital Agency. You operate inside a multi-tenant agency platform. ' +
  'Respond with valid JSON matching the requested schema. Never invent data — if information ' +
  'is missing, say so explicitly in your output. You produce recommendations; a deterministic ' +
  'approval and budget system decides execution.';

export async function runAgent<T = unknown>(opts: RunAgentOptions): Promise<T> {
  const agent = getAgent(opts.name);
  if (!agent) throw new Error(`UNKNOWN_AGENT: ${opts.name}`);
  if (agent.kind === 'deterministic') {
    throw new Error(`DETERMINISTIC_AGENT: ${opts.name} is a code module, not an LLM agent`);
  }

  const started = Date.now();
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: opts.prompt },
  ];
  if (opts.imageUrl) {
    userContent.push({ type: 'image_url', image_url: { url: opts.imageUrl } });
  }
  const res = await complete({
    task: agent.task as TaskKind,
    provider: opts.provider,
    system: opts.system ?? DEFAULT_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
    json: true,
  });

  const raw = res.choices[0]?.message?.content ?? '';
  const schema = opts.schema ?? agent.outputSchema;
  const parsed = schema.parse(JSON.parse(raw)) as T;

  if (opts.record !== false) {
    await pool
      .query(
        `INSERT INTO agent_runs (agency_id, client_id, agent, model, input, output, status, token_usage, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'succeeded', $7, to_timestamp($8/1000.0), now())`,
        [
          opts.scope.agency_id, opts.scope.client_id ?? null, opts.name, res.model,
          JSON.stringify({ prompt: opts.prompt }), JSON.stringify(parsed),
          JSON.stringify(res.usage ?? {}), started,
        ],
      )
      .catch(() => {
        /* best-effort telemetry; never block the answer on logging failure */
      });
  }
  return parsed;
}
