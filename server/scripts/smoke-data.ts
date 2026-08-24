/**
 * Dev smoke data — inserts 14 days of synthetic account-level performance
 * (declining ROAS + rising CPA scenario) so detectors/Morning Brief can be
 * verified end-to-end. Idempotent per date via ON CONFLICT.
 * Run: npx tsx scripts/smoke-data.ts
 */
import { pool } from '../src/db/pool.js';

const AGENCY_ID = 'd8b49a85-6aa5-411d-b7cd-c390d3715177'; // from npm run seed
const CLIENT_ID = '83ae2418-ba0e-4883-87ca-426f2407fa89';

async function main(): Promise<void> {
  for (let i = 1; i <= 7; i += 1) {
    // current 7 days: spend 100/day, weak returns (CPA up, ROAS down)
    await pool.query(
      `INSERT INTO performance_snapshots
         (agency_id, client_id, platform, entity_type, entity_external_id, stat_date,
          spend, revenue, conversions, impressions, clicks)
       VALUES ($1, $2, 'tiktok', 'account', 'acct1', now() - ($3 || ' days')::interval, $4, $5, $6, $7, $8)
       ON CONFLICT (platform, entity_type, entity_external_id, stat_date) DO NOTHING`,
      [AGENCY_ID, CLIENT_ID, String(i), 100, 250, 5, 5000, 50],
    );
    // prior 7 days: spend 50/day, healthy returns
    await pool.query(
      `INSERT INTO performance_snapshots
         (agency_id, client_id, platform, entity_type, entity_external_id, stat_date,
          spend, revenue, conversions, impressions, clicks)
       VALUES ($1, $2, 'tiktok', 'account', 'acct1', now() - ($3 || ' days')::interval, $4, $5, $6, $7, $8)
       ON CONFLICT (platform, entity_type, entity_external_id, stat_date) DO NOTHING`,
      [AGENCY_ID, CLIENT_ID, String(i + 7), 50, 300, 10, 2500, 25],
    );
  }
  console.log('Inserted 14 synthetic snapshot rows (7 healthy, 7 declining).');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
