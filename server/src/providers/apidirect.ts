/**
 * API Direct client (§8) — external market/social intelligence layer.
 * Sources: TikTok, Instagram, Facebook, Reddit, YouTube, X, LinkedIn,
 * news, websites, forums.
 *
 * SECURITY: the API key lives server-side (config). Never ship it to the
 * frontend. All responses are validated before use (dev rule 7).
 *
 * Uses API Direct's platform endpoints and X-API-Key authentication.
 */
import { z } from 'zod';
import { config } from '../config.js';

export const APIDIRECT_PLATFORMS = [
  'tiktok', 'instagram', 'facebook', 'reddit', 'youtube', 'x', 'linkedin', 'web', 'forum',
] as const;
export type ApiDirectPlatform = (typeof APIDIRECT_PLATFORMS)[number];

export const ResearchKind = [
  'competitor', 'viral', 'trend', 'complaint', 'question', 'language',
  'offer', 'influencer', 'format', 'sentiment', 'strategy',
] as const;

const ResearchItemSchema = z.object({
  platform: z.enum(APIDIRECT_PLATFORMS).optional(),
  kind: z.enum(ResearchKind).optional(),
  external_url: z.string().url().optional(),
  title: z.string().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  collected_at: z.string().optional(),
});

const ApiDirectRowSchema = z.object({
  title: z.string().optional(),
  url: z.string().url().optional(),
  date: z.string().optional(),
  source: z.string().optional(),
  snippet: z.string().optional(),
}).passthrough();

const ENDPOINTS: Record<ApiDirectPlatform, { path: string; arrayKeys: string[] }> = {
  tiktok: { path: '/v1/tiktok/videos', arrayKeys: ['videos'] },
  instagram: { path: '/v1/instagram/posts', arrayKeys: ['posts'] },
  facebook: { path: '/v1/facebook/posts', arrayKeys: ['posts'] },
  reddit: { path: '/v1/reddit/posts', arrayKeys: ['posts'] },
  youtube: { path: '/v1/youtube/videos', arrayKeys: ['videos'] },
  x: { path: '/v1/twitter/posts', arrayKeys: ['posts'] },
  linkedin: { path: '/v1/linkedin/posts', arrayKeys: ['posts'] },
  web: { path: '/v1/web/search', arrayKeys: ['results'] },
  forum: { path: '/v1/forums/posts', arrayKeys: ['posts'] },
};

export interface ResearchQuery {
  query: string;
  platforms?: ApiDirectPlatform[];
  kinds?: (typeof ResearchKind)[number][];
  limit?: number;
}

/** Run a research query against API Direct. Returns validated items. */
export async function research(query: ResearchQuery): Promise<z.infer<typeof ResearchItemSchema>[]> {
  // Four high-signal sources by default keeps each research run inexpensive.
  const platforms = query.platforms?.length ? query.platforms : ['tiktok', 'reddit', 'youtube', 'web'] as ApiDirectPlatform[];
  const apiKey = config.APIDIRECT_API_KEY_LIVE ?? config.APIDIRECT_API_KEY;
  const settled = await Promise.allSettled(platforms.map(async (platform) => {
    const endpoint = ENDPOINTS[platform];
    const params = new URLSearchParams({ query: query.query });
    if (platform === 'tiktok') params.set('sort_by', 'most_liked');
    else if (platform !== 'web' && platform !== 'forum') params.set('sort_by', 'most_recent');
    const res = await fetch(`${config.APIDIRECT_BASE_URL}${endpoint.path}?${params}`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`${platform}: HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
    }
    const body = await res.json() as Record<string, unknown>;
    const raw = endpoint.arrayKeys.map((key) => body[key]).find(Array.isArray) ?? [];
    return (raw as unknown[]).map((value) => {
      const row = ApiDirectRowSchema.parse(value);
      return ResearchItemSchema.parse({
        platform,
        kind: query.kinds?.[0] ?? (platform === 'web' ? 'competitor' : 'trend'),
        external_url: row.url,
        title: row.title ?? row.snippet,
        content: row,
        collected_at: row.date ?? new Date().toISOString(),
      });
    });
  }));
  const sourceItems = settled.map((result) => result.status === 'fulfilled' ? result.value : []);
  const items: z.infer<typeof ResearchItemSchema>[] = [];
  // Interleave sources so a global limit cannot be exhausted by the first platform.
  for (let index = 0; sourceItems.some((rows) => index < rows.length); index += 1) {
    for (const rows of sourceItems) {
      if (rows[index]) items.push(rows[index]);
    }
  }
  if (items.length === 0) {
    const errors = settled.flatMap((result) => result.status === 'rejected' ? [String(result.reason)] : []);
    throw new Error(`APIDIRECT_ERROR: ${errors.join('; ') || 'no results returned'}`);
  }
  return items.slice(0, query.limit ?? 20);
}
