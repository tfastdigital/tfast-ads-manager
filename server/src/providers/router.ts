/**
 * Model Router (§6) — OpenAI (primary reasoning/orchestration) + DeepSeek (high-volume).
 * Business logic never hard-codes a provider: callers ask by TaskKind,
 * or pin a provider explicitly for controlled experiments.
 */
import OpenAI from 'openai';
import { config } from '../config.js';

export type ProviderId = 'openai' | 'deepseek';

export type TaskKind =
  | 'orchestration'
  | 'strategy'
  | 'multimodal_creative'
  | 'tool_selection'
  | 'executive_report'
  | 'classification'
  | 'extraction'
  | 'summarization'
  | 'clustering'
  | 'preprocessing'
  | 'analysis_bulk'
  | 'analysis_synthesis';

/** §6 routing matrix. */
const TASK_ROUTING: Record<TaskKind, ProviderId> = {
  orchestration: 'openai',
  strategy: 'openai',
  multimodal_creative: 'openai',
  tool_selection: 'openai',
  executive_report: 'openai',
  classification: 'deepseek',
  extraction: 'deepseek',
  summarization: 'deepseek',
  clustering: 'deepseek',
  preprocessing: 'deepseek',
  analysis_bulk: 'deepseek',
  analysis_synthesis: 'openai',
};

export function routeTask(task: TaskKind, pin?: ProviderId): ProviderId {
  return pin ?? TASK_ROUTING[task];
}

const openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
const deepseekClient = new OpenAI({
  apiKey: config.DEEPSEEK_API_KEY,
  baseURL: config.DEEPSEEK_BASE_URL,
});

const MODELS: Record<ProviderId, string> = {
  openai: 'gpt-4o',          // swap for gpt-4.1 / o-series as desired
  deepseek: 'deepseek-chat',
};

export interface CompletionOptions {
  task: TaskKind;
  provider?: ProviderId;     // 'auto' semantics: omit to use the routing matrix
  system?: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  json?: boolean;            // structured-output mode
}

export function clientFor(provider: ProviderId): OpenAI {
  return provider === 'openai' ? openaiClient : deepseekClient;
}

export async function complete(opts: CompletionOptions) {
  const provider = routeTask(opts.task, opts.provider);
  const client = clientFor(provider);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
    ...opts.messages,
  ];
  return client.chat.completions.create({
    model: MODELS[provider],
    messages,
    response_format: opts.json ? { type: 'json_object' } : undefined,
  });
}

/**
 * Embeddings for semantic memory (pgvector, 1536-dim).
 * Always uses OpenAI embeddings (text-embedding-3-small) regardless of
 * the chat-completion routing matrix.
 */
export async function embedText(text: string): Promise<number[]> {
  const res = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

export const providerModel = (p: ProviderId) => MODELS[p];
