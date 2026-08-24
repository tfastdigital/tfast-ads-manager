/**
 * In-process scheduler — Morning Brief (and optional platform syncs) on an
 * interval. Zero-dependency; production would use a proper job runner.
 * Config (env):
 *   MORNING_BRIEF_INTERVAL_HOURS   (default 0 = disabled; e.g. 24)
 *   TIKTOK_SYNC_INTERVAL_HOURS     (default 0 = disabled)
 *   META_SYNC_INTERVAL_HOURS       (default 0 = disabled)
 *   GOOGLE_SYNC_INTERVAL_HOURS     (default 0 = disabled)
 */
import { pool } from './db/pool.js';
import { runMorningBrief } from './jobs/morning-brief.js';
import { syncTikTokReports } from './jobs/tiktok-sync.js';
import { syncPlatformReports } from './jobs/platform-sync.js';

export function startScheduler(): void {
  const briefHours = Number(process.env.MORNING_BRIEF_INTERVAL_HOURS ?? 0);
  const syncHours = Number(process.env.TIKTOK_SYNC_INTERVAL_HOURS ?? 0);
  const metaSyncHours = Number(process.env.META_SYNC_INTERVAL_HOURS ?? 0);
  const googleSyncHours = Number(process.env.GOOGLE_SYNC_INTERVAL_HOURS ?? 0);

  if (briefHours > 0) {
    console.log(`[scheduler] Morning Brief every ${briefHours}h`);
    void scheduledBriefs();
    setInterval(() => void scheduledBriefs(), briefHours * 3600_000);
  }
  if (syncHours > 0) {
    console.log(`[scheduler] TikTok sync every ${syncHours}h`);
    void scheduledSync('tiktok');
    setInterval(() => void scheduledSync('tiktok'), syncHours * 3600_000);
  }
  if (metaSyncHours > 0) {
    console.log(`[scheduler] Meta sync every ${metaSyncHours}h`);
    void scheduledSync('meta');
    setInterval(() => void scheduledSync('meta'), metaSyncHours * 3600_000);
  }
  if (googleSyncHours > 0) {
    console.log(`[scheduler] Google sync every ${googleSyncHours}h`);
    void scheduledSync('google');
    setInterval(() => void scheduledSync('google'), googleSyncHours * 3600_000);
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

async function scheduledSync(platform: 'tiktok' | 'meta' | 'google'): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM agencies`);
    for (const a of rows) {
      const scope = { agency_id: a.id, actor: { kind: 'agent' as const, id: 'scheduler' } };
      if (platform === 'tiktok') {
        await syncTikTokReports(scope, 30);
      } else {
        await syncPlatformReports(platform, scope, 30);
      }
    }
    console.log(`[scheduler] ${platform} sync complete`);
  } catch (err) {
    console.error(`[scheduler] ${platform} sync failed:`, err);
  }
}
