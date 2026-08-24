/**
 * In-process scheduler — Morning Brief (and optional TikTok sync) on an
 * interval. Zero-dependency; production would use a proper job runner.
 * Config (env):
 *   MORNING_BRIEF_INTERVAL_HOURS   (default 0 = disabled; e.g. 24)
 *   TIKTOK_SYNC_INTERVAL_HOURS     (default 0 = disabled)
 */
import { pool } from './db/pool.js';
import { runMorningBrief } from './jobs/morning-brief.js';
import { syncTikTokReports } from './jobs/tiktok-sync.js';

export function startScheduler(): void {
  const briefHours = Number(process.env.MORNING_BRIEF_INTERVAL_HOURS ?? 0);
  const syncHours = Number(process.env.TIKTOK_SYNC_INTERVAL_HOURS ?? 0);

  if (briefHours > 0) {
    console.log(`[scheduler] Morning Brief every ${briefHours}h`);
    void scheduledBriefs();
    setInterval(() => void scheduledBriefs(), briefHours * 3600_000);
  }
  if (syncHours > 0) {
    console.log(`[scheduler] TikTok sync every ${syncHours}h`);
    void scheduledSync();
    setInterval(() => void scheduledSync(), syncHours * 3600_000);
  }
}

async function scheduledBriefs(): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM agencies`);
    for (const a of rows) {
      await runMorningBrief(
        { agency_id: a.id, actor: { kind: 'agent', id: 'scheduler' } },
        { includeAiRecommendations: true },
      );
    }
    console.log('[scheduler] Morning Brief complete');
  } catch (err) {
    console.error('[scheduler] Morning Brief failed:', err);
  }
}

async function scheduledSync(): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM agencies`);
    for (const a of rows) {
      await syncTikTokReports({ agency_id: a.id, actor: { kind: 'agent', id: 'scheduler' } }, 30);
    }
    console.log('[scheduler] TikTok sync complete');
  } catch (err) {
    console.error('[scheduler] TikTok sync failed:', err);
  }
}
