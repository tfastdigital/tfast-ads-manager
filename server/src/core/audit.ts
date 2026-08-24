/**
 * Audit Logger — append-only evidence chain.
 * Every AI action records the full decision surface so a human can ask:
 *   "Why did TFast AI pause this advertisement?"
 * and receive an evidence-based answer.
 */
import { z } from 'zod';

export const AuditRecordSchema = z.object({
  agent: z.string().optional(),
  model: z.string().optional(),
  agency_id: z.string(),
  client_id: z.string().optional(),
  account_id: z.string().optional(),
  campaign_id: z.string().optional(),
  actor: z.string(), // user:<id> | agent:<name>
  action: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
  decision: z.string().optional(),
  tool: z.string().optional(),
  proposed_parameters: z.record(z.string(), z.unknown()).optional(),
  policy_result: z.record(z.string(), z.unknown()).optional(),
  approval_status: z.string().optional(),
  execution_result: z.record(z.string(), z.unknown()).optional(),
  before_state: z.record(z.string(), z.unknown()).optional(),
  after_state: z.record(z.string(), z.unknown()).optional(),
});

export type AuditRecord = z.infer<typeof AuditRecordSchema>;

/** Append an audit entry. Insert-only — no UPDATE/DELETE path exists. */
export async function appendAuditLog(
  db: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  record: AuditRecord,
): Promise<void> {
  const r = AuditRecordSchema.parse(record);
  const cols = Object.keys(r);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  await db.query(
    `INSERT INTO audit_logs (${cols.join(', ')})
     VALUES (${placeholders})`,
    cols.map((c) => (r as Record<string, unknown>)[c] ?? null),
  );
}

/** Redact known secret patterns before logging inputs (defense-in-depth). */
export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
      .replace(/ak_live_[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /key|token|secret|password/i.test(k) ? '[REDACTED]' : redactSecrets(v);
    }
    return out;
  }
  return value;
}
