/**
 * Creative Intelligence — structured creative memory.
 * Extracts creative attributes (hook, hook_type, format, emotions, offer,
 * CTA …) via multimodal analysis, stores them in creative_attributes, and
 * correlates attributes with performance to discover which creative
 * characteristics drive results.
 */
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { assertClientScoped, type TenantScope } from '../core/tenant.js';
import { runAgent } from '../agents/run-agent.js';
import { CreativeInsightSchema } from '../agents/registry.js';
import { remember } from '../services/memory.js';

export const CreativeAnalyzeInputSchema = z.object({
  external_id: z.string().min(1),
  asset_url: z.string().url().optional(),
  name: z.string().optional(),
  platform: z.string().default('tiktok'),
});

export interface AttributeCorrelationRow {
  attribute: string;
  value: string;
  ads: number;
  spend: number;
  roas: number;
  avg_cpa: number;
  conversions: number;
}

/** Extract + store attributes for one creative. */
export async function extractCreativeAttributes(
  scope: TenantScope,
  input: z.infer<typeof CreativeAnalyzeInputSchema>,
): Promise<{ creative_id: string; attributes: z.infer<typeof CreativeInsightSchema> }> {
  assertClientScoped(scope);

  // Upsert the creative row (dedupe by client + platform + external id)
  let { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM creatives WHERE agency_id = $1 AND client_id = $2 AND platform = $3 AND external_id = $4`,
    [scope.agency_id, scope.client_id, input.platform, input.external_id],
  );
  let creativeId = rows[0]?.id;
  if (!creativeId) {
    const insert = await pool.query<{ id: string }>(
      `INSERT INTO creatives (agency_id, client_id, platform, external_id, media_type, asset_url)
       VALUES ($1, $2, $3, $4, 'video', $5)
       RETURNING id`,
      [scope.agency_id, scope.client_id, input.platform, input.external_id, input.asset_url ?? null],
    );
    creativeId = insert.rows[0].id;
  }

  const insight = await runAgent<z.infer<typeof CreativeInsightSchema>>({
    name: 'creative-intelligence-agent',
    scope,
    imageUrl: input.asset_url,
    prompt:
      `Analyze this ad creative${input.name ? ` ("${input.name}")` : ''}` +
      (input.asset_url ? ` at ${input.asset_url}` : '') +
      `.\nExtract its structured characteristics and return JSON matching this schema:\n` +
      `{"creative_id": string, "format": "ugc|talking_head|demo|skit|before_after|other", ` +
      `"hook": string (first line spoken/on screen), "hook_type": "contrarian|curiosity|social_proof|problem|trend|other", ` +
      `"presenter_type": "customer|founder|creator|voiceover|none", "opening_style": "face_to_camera|text_overlay|product_shot|other", ` +
      `"duration_seconds": number, "problem": "high_price|complexity|distrust|other", ` +
      `"emotions": string[], "offer": "free_consultation|discount|trial|other", ` +
      `"cta": "book_now|shop_now|learn_more|other", "caption_style": "dynamic_subtitles|none|static"}.` +
      `\nIf the image is unavailable, still infer attributes from the name/context and mark uncertainty in the fields.`,
  });

  const attrs = { ...insight, creative_id: creativeId };
  await pool.query(
    `INSERT INTO creative_attributes
       (creative_id, client_id, platform, format, hook, hook_type, presenter_type, opening_style,
        duration_seconds, problem, emotions, offer, cta, caption_style, extracted_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
     ON CONFLICT (creative_id) DO UPDATE SET
       format=EXCLUDED.format, hook=EXCLUDED.hook, hook_type=EXCLUDED.hook_type,
       presenter_type=EXCLUDED.presenter_type, opening_style=EXCLUDED.opening_style,
       duration_seconds=EXCLUDED.duration_seconds, problem=EXCLUDED.problem, emotions=EXCLUDED.emotions,
       offer=EXCLUDED.offer, cta=EXCLUDED.cta, caption_style=EXCLUDED.caption_style`,
    [
      creativeId, scope.client_id, input.platform, attrs.format, attrs.hook, attrs.hook_type,
      attrs.presenter_type, attrs.opening_style, attrs.duration_seconds, attrs.problem,
      JSON.stringify(attrs.emotions), attrs.offer, attrs.cta, attrs.caption_style,
      'creative-intelligence-agent',
    ],
  );

  return { creative_id: creativeId, attributes: attrs };
}

/** Batch: extract attributes for many creatives, skipping failures. */
export async function analyzeCreativeBatch(
  scope: TenantScope,
  items: Array<z.infer<typeof CreativeAnalyzeInputSchema>>,
): Promise<{ analyzed: number; failed: Array<{ external_id: string; error: string }> }> {
  assertClientScoped(scope);
  const failed: Array<{ external_id: string; error: string }> = [];
  let analyzed = 0;
  for (const item of items) {
    try {
      await extractCreativeAttributes(scope, item);
      analyzed += 1;
    } catch (err) {
      failed.push({ external_id: item.external_id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { analyzed, failed };
}

/**
 * Correlation — join creative attributes with ad-level performance
 * to find which characteristics correlate with strong results.
 */
export async function correlateCreativeAttributes(scope: TenantScope, days = 30): Promise<AttributeCorrelationRow[]> {
  assertClientScoped(scope);
  const { rows } = await pool.query<AttributeCorrelationRow>(
    `WITH perf AS (
       SELECT entity_external_id,
              SUM(spend)::float8 AS spend,
              SUM(revenue)::float8 AS revenue,
              SUM(conversions)::float8 AS conversions,
              CASE WHEN SUM(spend) > 0 THEN SUM(revenue)/SUM(spend) ELSE 0 END AS roas,
              CASE WHEN SUM(conversions) > 0 THEN SUM(spend)/SUM(conversions) ELSE 0 END AS cpa
       FROM performance_snapshots
       WHERE agency_id = $1 AND client_id = $2 AND entity_type = 'ad'
         AND stat_date >= now() - ($3 || ' days')::interval
       GROUP BY entity_external_id
     ),
     joined AS (
       SELECT cr.external_id, ca.hook_type, ca.format, ca.cta, ca.offer, ca.presenter_type,
              p.spend, p.revenue, p.conversions, p.roas, p.cpa
       FROM creative_attributes ca
       JOIN creatives cr ON cr.id = ca.creative_id
       LEFT JOIN perf p ON p.entity_external_id = cr.external_id
       WHERE ca.client_id = $2
     )
     SELECT attribute, value,
            COUNT(*)::int AS ads,
            COALESCE(SUM(spend),0)::float8 AS spend,
            CASE WHEN SUM(spend) > 0 THEN SUM(revenue)/SUM(spend) ELSE 0 END AS roas,
            CASE WHEN SUM(conversions) > 0 THEN SUM(spend)/SUM(conversions) ELSE 0 END AS avg_cpa,
            COALESCE(SUM(conversions),0)::float8 AS conversions
     FROM joined
     CROSS JOIN LATERAL (VALUES ('hook_type', hook_type), ('format', format), ('cta', cta), ('offer', offer), ('presenter_type', presenter_type)) AS t(attribute, value)
     WHERE value IS NOT NULL AND value <> ''
     GROUP BY attribute, value
     ORDER BY roas DESC NULLS LAST`,
    [scope.agency_id, scope.client_id, String(days)],
  );
  return rows;
}

/** Top hooks by ROAS — feeds the refresh brief and hook intelligence. */
export async function topHooks(scope: TenantScope, days = 30, limit = 10): Promise<unknown[]> {
  assertClientScoped(scope);
  const { rows } = await pool.query(
    `WITH perf AS (
       SELECT entity_external_id,
              SUM(spend)::float8 AS spend,
              CASE WHEN SUM(spend) > 0 THEN SUM(revenue)/SUM(spend) ELSE 0 END AS roas
       FROM performance_snapshots
       WHERE agency_id = $1 AND client_id = $2 AND entity_type = 'ad'
         AND stat_date >= now() - ($3 || ' days')::interval
       GROUP BY entity_external_id
     )
     SELECT ca.hook, ca.hook_type, ca.format, p.spend, p.roas
     FROM creative_attributes ca
     JOIN creatives cr ON cr.id = ca.creative_id
     JOIN perf p ON p.entity_external_id = cr.external_id
     WHERE ca.client_id = $2
     ORDER BY p.roas DESC NULLS LAST
     LIMIT $4`,
    [scope.agency_id, scope.client_id, String(days), String(limit)],
  );
  return rows;
}

/** Persist the strongest attribute-performance signal as a client memory. */
export async function rememberCreativePatterns(scope: TenantScope, days = 30): Promise<string | null> {
  const corr = await correlateCreativeAttributes(scope, days);
  const strong = corr.filter((c) => c.roas > 0 && c.ads >= 2).sort((a, b) => b.roas - a.roas).slice(0, 5);
  if (strong.length === 0) return null;
  const content =
    `Creative attribute correlation (${days}d): ` +
    strong.map((s) => `${s.attribute}=${s.value} → ROAS ${s.roas.toFixed(2)} across ${s.ads} ads`).join('; ');
  try {
    return await remember(scope, { kind: 'observation', content, importance: 7 });
  } catch {
    return null; // embedding provider unreachable
  }
}
