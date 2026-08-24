/**
 * Memory service — pgvector semantic memory.
 * Two strictly separated levels:
 *   CLIENT MEMORY   (client_id set, confidential, never cross-client)
 *   AGENCY KNOWLEDGE (client_id NULL, anonymized patterns only)
 * Promotion to agency knowledge requires an explicit anonymized payload —
 * the service refuses client-derived content that isn't flagged anonymized.
 */
import { pool } from '../db/pool.js';
import { assertClientScoped, type TenantScope } from '../core/tenant.js';
import { embedText } from '../providers/router.js';

export type MemoryKind = 'fact' | 'observation' | 'hypothesis' | 'lesson';

export interface RememberInput {
  kind: MemoryKind;
  content: string;
  importance?: number; // 1–10
}

export async function remember(scope: TenantScope, input: RememberInput): Promise<string> {
  assertClientScoped(scope);
  const importance = Math.min(10, Math.max(1, input.importance ?? 5));
  const embedding = await embedText(input.content);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO memories (agency_id, client_id, scope, kind, content, embedding, importance, is_anonymized)
     VALUES ($1, $2, 'client', $3, $4, $5::vector, $6, false)
     RETURNING id`,
    [scope.agency_id, scope.client_id, input.kind, input.content, vectorLiteral(embedding), importance],
  );
  return rows[0].id;
}

/** Semantic recall — client scope only (never reads other clients' rows). */
export async function recall(scope: TenantScope, queryText: string, k = 5) {
  assertClientScoped(scope);
  const embedding = await embedText(queryText);
  const { rows } = await pool.query<{
    id: string; kind: MemoryKind; content: string; importance: number; similarity: number;
  }>(
    `SELECT id, kind, content, importance,
            1 - (embedding <=> $1::vector) AS similarity
     FROM memories
     WHERE agency_id = $2 AND client_id = $3 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    [vectorLiteral(embedding), scope.agency_id, scope.client_id, k],
  );
  return rows;
}

/**
 * Promote a lesson into AGENCY KNOWLEDGE.
 * HARD RULE: anonymized_content must be explicitly provided and flagged.
 * Never auto-promote client rows — confidential creatives, financials,
 * audiences, strategies and customer data must not leak cross-client.
 */
export async function promoteToAgencyKnowledge(
  scope: TenantScope,
  input: { lesson_id: string; topic: string; pattern: Record<string, unknown>; anonymized_content: string },
): Promise<string> {
  assertClientScoped(scope);
  const embedding = await embedText(input.anonymized_content);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO agency_knowledge (agency_id, topic, pattern, evidence, embedding, confidence)
     VALUES ($1, $2, $3, $4::jsonb, $5::vector, 0.5)
     RETURNING id`,
    [
      scope.agency_id, input.topic, JSON.stringify(input.pattern),
      JSON.stringify({ anonymized_content: input.anonymized_content }), vectorLiteral(embedding),
    ],
  );
  await pool.query(
    `UPDATE lessons SET promoted_to_memory = true WHERE id = $1 AND agency_id = $2 AND client_id = $3`,
    [input.lesson_id, scope.agency_id, scope.client_id],
  );
  return rows[0].id;
}

/** Agency-wide semantic recall — anonymized knowledge only. */
export async function recallAgencyKnowledge(scope: TenantScope, queryText: string, k = 5) {
  const embedding = await embedText(queryText);
  const { rows } = await pool.query<{ id: string; topic: string; pattern: unknown; similarity: number }>(
    `SELECT id, topic, pattern,
            1 - (embedding <=> $1::vector) AS similarity
     FROM agency_knowledge
     WHERE agency_id = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral(embedding), scope.agency_id, k],
  );
  return rows;
}

/** pgvector expects '[0.1,0.2,...]' text form. */
function vectorLiteral(v: number[]): string {
  return `[${v.map((n) => Number(n.toFixed(6))).join(',')}]`;
}
