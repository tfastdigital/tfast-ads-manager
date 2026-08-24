/**
 * Single-process pipeline verification — inserts synthetic data and runs
 * the Morning Brief + portfolio in the SAME process (PGlite is
 * single-process in dev mode; production uses real PostgreSQL).
 * Run: npx tsx scripts/verify-pipeline.ts
 */
import { pool } from '../src/db/pool.js';
import { runMorningBrief } from '../src/jobs/morning-brief.js';
import { portfolioSnapshot } from '../src/agents/commander.js';

const AGENCY_ID = 'd8b49a85-6aa5-411d-b7cd-c390d3715177';
const CLIENT_ID = '83ae2418-ba0e-4883-87ca-426f2407fa89';

async function main(): Promise<void> {
  const scope = { agency_id: AGENCY_ID, client_id: CLIENT_ID, actor: { kind: 'user' as const, id: 'verify' } };

  // 1. Insert synthetic rows (idempotent)
  for (let i = 1; i <= 7; i += 1) {
    await pool.query(
      `INSERT INTO performance_snapshots
         (agency_id, client_id, platform, entity_type, entity_external_id, stat_date,
          spend, revenue, conversions, impressions, clicks)
       VALUES ($1, $2, 'tiktok', 'account', 'acct1', now() - ($3 || ' days')::interval, $4, $5, $6, $7, $8)
       ON CONFLICT (platform, entity_type, entity_external_id, stat_date) DO NOTHING`,
      [AGENCY_ID, CLIENT_ID, String(i), 100, 250, 5, 5000, 50],
    );
    await pool.query(
      `INSERT INTO performance_snapshots
         (agency_id, client_id, platform, entity_type, entity_external_id, stat_date,
          spend, revenue, conversions, impressions, clicks)
       VALUES ($1, $2, 'tiktok', 'account', 'acct1', now() - ($3 || ' days')::interval, $4, $5, $6, $7, $8)
       ON CONFLICT (platform, entity_type, entity_external_id, stat_date) DO NOTHING`,
      [AGENCY_ID, CLIENT_ID, String(i + 7), 50, 300, 10, 2500, 25],
    );
  }

  // 2. Portfolio
  const snapshot = await portfolioSnapshot({ agency_id: AGENCY_ID, actor: { kind: 'user', id: 'verify' } });
  console.log('PORTFOLIO:', JSON.stringify(snapshot, null, 1));

  // 3. Morning Brief
  const brief = await runMorningBrief({ agency_id: AGENCY_ID, actor: { kind: 'user', id: 'verify' } });
  console.log('BRIEF:', JSON.stringify(brief, null, 1));

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
