/**
 * Research pipeline (Phase 4) — API Direct → research_items (embedded) →
 * DeepSeek classification → market_insights.
 * Everything is scoped to the client; embeddings land in pgvector for
 * semantic recall by the Market Intelligence Agent.
 */
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { assertClientScoped, type TenantScope } from '../core/tenant.js';
import { research, type ApiDirectPlatform } from '../providers/apidirect.js';
import { embedText } from '../providers/router.js';
import { runAgent } from '../agents/run-agent.js';

export const ResearchInputSchema = z.object({
  query: z.string().min(2),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'facebook', 'reddit', 'youtube', 'x', 'linkedin', 'web', 'forum'])).optional(),
  kinds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  classify: z.boolean().default(true),
});

export type ResearchInput = z.infer<typeof ResearchInputSchema>;

export interface ResearchSummary {
  items: number;
  insights: number;
  skipped_classification?: string;
}

export async function runResearch(scope: TenantScope, input: ResearchInput): Promise<ResearchSummary> {
  assertClientScoped(scope);
  const items = await research({
    query: input.query,
    platforms: input.platforms as ApiDirectPlatform[] | undefined,
    kinds: input.kinds as never[] | undefined,
    limit: input.limit,
  });

  let itemCount = 0;
  for (const item of items) {
    const snippet = [item.title, JSON.stringify(item.content ?? {}).slice(0, 1200)].filter(Boolean).join(' — ');
    let embedding: number[] | null = null;
    try {
      if (snippet) embedding = await embedText(snippet.slice(0, 8000));
    } catch {
      embedding = null; // embedding provider unreachable — store without vector
    }
    await pool.query(
      `INSERT INTO research_items (agency_id, client_id, source, platform, kind, external_url, content, embedding)
       VALUES ($1, $2, 'apidirect', $3, $4, $5, $6::jsonb, $7::vector)
       ON CONFLICT DO NOTHING`,
      [
        scope.agency_id, scope.client_id, item.platform ?? 'web', item.kind ?? 'competitor',
        item.external_url ?? null,
        JSON.stringify({ title: item.title, content: item.content ?? {}, collected_at: item.collected_at }),
        embedding ? vectorLiteral(embedding) : null,
      ],
    );
    itemCount += 1;
  }

  let insights = 0;
  let skipped: string | undefined;
  if (input.classify && items.length > 0) {
    try {
      const result = await runAgent<Array<{ insight: string; kind: string; confidence: number }>>({
        name: 'market-intelligence-agent',
        scope,
        prompt:
          `Client research on "${input.query}". Items:\n` +
          items.slice(0, 30).map((i) => `- [${i.platform}/${i.kind}] ${i.title ?? ''}`).join('\n') +
          `\nReturn a JSON array: [{"insight": string, "kind": string, "confidence": 0-1}]` +
          `\nExtract market insights: competitor strategies, trending hooks, customer complaints/questions, audience language, offers.`,
      });
      for (const ins of result.slice(0, 10)) {
        await pool.query(
          `INSERT INTO market_insights (agency_id, client_id, insight, category, confidence)
           VALUES ($1, $2, $3, $4, $5)`,
          [scope.agency_id, scope.client_id, ins.insight, ins.kind, Math.min(1, Math.max(0, ins.confidence ?? 0.5))],
        );
        insights += 1;
      }
    } catch (err) {
      skipped = err instanceof Error ? err.message : String(err);
    }
  }

  return { items: itemCount, insights, skipped_classification: skipped };
}

function vectorLiteral(v: number[]): string {
  return `[${v.map((n) => Number(n.toFixed(6))).join(',')}]`;
}
