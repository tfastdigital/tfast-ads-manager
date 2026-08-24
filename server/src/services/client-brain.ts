/**
 * Client Brain service.
 * Sections: business, brand, customers, economics, advertising_history,
 * competitors, ai_knowledge. Versioned updates; auto-loaded before any
 * recommendation or decision for the client.
 */
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { assertClientScoped, type TenantScope } from '../core/tenant.js';

export const BRAIN_SECTIONS = [
  'business', 'brand', 'customers', 'economics',
  'advertising_history', 'competitors', 'ai_knowledge',
] as const;
export type BrainSection = (typeof BRAIN_SECTIONS)[number];

export const BrainContentSchema = z.record(z.string(), z.unknown());

export interface BrainEntry {
  section: BrainSection;
  content: Record<string, unknown>;
  version: number;
  updated_at: Date;
}

export async function getBrain(scope: TenantScope): Promise<Map<BrainSection, BrainEntry>> {
  assertClientScoped(scope);
  const { rows } = await pool.query<{ section: BrainSection; content: unknown; version: number; updated_at: Date }>(
    `SELECT section, content, version, updated_at
     FROM client_brains
     WHERE agency_id = $1 AND client_id = $2
     ORDER BY section`,
    [scope.agency_id, scope.client_id],
  );
  return new Map(rows.map((r) => [r.section, { section: r.section, content: r.content as Record<string, unknown>, version: r.version, updated_at: r.updated_at }]));
}

/** Upsert a brain section with a version bump. Returns the new version. */
export async function updateBrainSection(
  scope: TenantScope,
  section: BrainSection,
  content: Record<string, unknown>,
  updatedBy: string,
): Promise<number> {
  assertClientScoped(scope);
  const parsed = BrainContentSchema.parse(content);
  const { rows } = await pool.query<{ version: number }>(
    `INSERT INTO client_brains (agency_id, client_id, section, content, version, updated_by)
     VALUES ($1, $2, $3, $4, 1, $5)
     ON CONFLICT (client_id, section) DO UPDATE
       SET content = EXCLUDED.content,
           version = client_brains.version + 1,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
     RETURNING version`,
    [scope.agency_id, scope.client_id, section, JSON.stringify(parsed), updatedBy],
  );
  return rows[0].version;
}

/** Compact prompt-ready context built from the brain. */
export async function buildBrainContext(scope: TenantScope): Promise<string> {
  const brain = await getBrain(scope);
  if (brain.size === 0) return '(no Client Brain data yet — ask the user or onboard the client)';
  const parts: string[] = [];
  for (const [section, entry] of brain) {
    parts.push(`## ${section}\n${compact(entry.content)}`);
  }
  return parts.join('\n\n');
}

function compact(obj: Record<string, unknown>, depth = 0): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      lines.push(`${'  '.repeat(depth)}- ${k}:`);
      lines.push(compact(v as Record<string, unknown>, depth + 1));
    } else {
      lines.push(`${'  '.repeat(depth)}- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
    }
  }
  return lines.join('\n');
}

/** Read a specific section (used by Budget Governor / Commander for targets). */
export async function getEconomics(scope: TenantScope): Promise<Record<string, unknown>> {
  const brain = await getBrain(scope);
  return brain.get('economics')?.content ?? {};
}
