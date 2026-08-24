/**
 * Single-process verification for Phase 6 (experiments, creative
 * intelligence) + Phase 7 (leads, attribution, profit).
 * Run: npx tsx scripts/verify-phase67.ts  (server must NOT be running —
 * PGlite is single-process in dev mode).
 */
import { pool } from '../src/db/pool.js';
import { createExperiment, evaluateExperiment } from '../src/jobs/experiments.js';
import { correlateCreativeAttributes, topHooks } from '../src/jobs/creative-intelligence.js';
import { ingestLead, transitionLead, attributionReport, profitReport } from '../src/services/business.js';

const A = 'd8b49a85-6aa5-411d-b7cd-c390d3715177';
const C = '83ae2418-ba0e-4883-87ca-426f2407fa89';
const scope = { agency_id: A, client_id: C, actor: { kind: 'user' as const, id: 'verify' } };

async function main(): Promise<void> {
  // ── Fixtures: connection → ad account → 2 campaigns ─────
  const conn = await pool.query<{ id: string }>(
    `INSERT INTO connections (agency_id, client_id, provider, external_account_id, advertiser_id, credential_reference, status)
     VALUES ($1,$2,'tiktok','acct-verify','adv-verify','secret-store:tiktok-verify','active')
     ON CONFLICT (client_id, provider, external_account_id) DO UPDATE SET status='active'
     RETURNING id`,
    [A, C],
  );
  const acct = await pool.query<{ id: string }>(
    `INSERT INTO ad_accounts (agency_id, client_id, connection_id, platform, external_account_id)
     VALUES ($1,$2,$3,'tiktok','acct-verify')
     ON CONFLICT (client_id, platform, external_account_id) DO NOTHING`,
    [A, C, conn.rows[0].id],
  );
  const { rows: acctRow } = await pool.query<{ id: string }>(
    `SELECT id FROM ad_accounts WHERE client_id = $1 AND external_account_id = 'acct-verify'`,
    [C],
  );
  const acctId = acctRow[0].id;
  for (const [ext, name] of [['campA', 'Campaign A'], ['campB', 'Campaign B']] as const) {
    await pool.query(
      `INSERT INTO campaigns (agency_id, client_id, ad_account_id, platform, external_id, name)
       VALUES ($1,$2,$3,'tiktok',$4,$5)
       ON CONFLICT (ad_account_id, platform, external_id) DO NOTHING`,
      [A, C, acctId, ext, name],
    );
  }

  // ── Phase 6a: experiment engine ─────────────────────────
  // Variant ads with ad-level snapshot performance
  for (const [ext, spend, rev, conv, daysAgo] of [
    ['hookA', 200, 900, 20, 1], ['hookA', 200, 900, 20, 2], ['hookA', 200, 900, 20, 3],
    ['hookB', 200, 500, 10, 1], ['hookB', 200, 500, 10, 2], ['hookB', 200, 500, 10, 3],
  ] as const) {
    await pool.query(
      `INSERT INTO performance_snapshots
         (agency_id, client_id, platform, entity_type, entity_external_id, stat_date,
          spend, revenue, conversions, impressions, clicks)
       VALUES ($1,$2,'tiktok','ad',$3, now() - ($4 || ' days')::interval, $5,$6,$7,10000,200)
       ON CONFLICT (platform, entity_type, entity_external_id, stat_date) DO UPDATE
         SET spend=EXCLUDED.spend, revenue=EXCLUDED.revenue, conversions=EXCLUDED.conversions`,
      [A, C, ext, String(daysAgo), spend, rev, conv],
    );
  }

  const exp = await createExperiment(scope, {
    observation: 'CTR declined 32%.',
    diagnosis: 'Possible creative fatigue.',
    hypothesis: 'Changing the opening three seconds while retaining audience and offer will improve CTR.',
    title: 'Hook A vs Hook B',
    variants: [
      { name: 'hookA', ad_external_id: 'hookA' },
      { name: 'hookB', ad_external_id: 'hookB' },
    ],
    success_criteria: ['ROAS ≥ 4'],
    duration_days: 7,
  });
  const evalResult = await evaluateExperiment(scope, exp.experiment_id);
  console.log('EXPERIMENT:', JSON.stringify({ id: evalResult.experiment_id, winner: evalResult.winner, lesson_id: evalResult.lesson_id }));

  // ── Phase 6b: creative attribute correlation ────────────
  for (const [ext, hookType, cta] of [['hookA', 'contrarian', 'book_now'], ['hookB', 'curiosity', 'learn_more']] as const) {
    const cr = await pool.query<{ id: string }>(
      `INSERT INTO creatives (agency_id, client_id, platform, external_id, media_type)
       VALUES ($1,$2,'tiktok',$3,'video') RETURNING id`,
      [A, C, ext],
    );
    await pool.query(
      `INSERT INTO creative_attributes (creative_id, client_id, platform, format, hook, hook_type, cta)
       VALUES ($1,$2,'tiktok','ugc','test hook',$3,$4) ON CONFLICT (creative_id) DO NOTHING`,
      [cr.rows[0].id, C, hookType, cta],
    );
  }
  const corr = await correlateCreativeAttributes(scope, 7);
  console.log('CORRELATION:', JSON.stringify(corr.filter((r) => r.attribute === 'hook_type')));
  const hooks = await topHooks(scope, 7);
  console.log('TOP HOOKS:', JSON.stringify(hooks));

  // ── Phase 7: the §19 scenario (B higher CPL, far more qualified) ──
  // Campaign A: 25 leads, few qualified. Campaign B: 10 leads, mostly qualified.
  await pool.query(
    `INSERT INTO performance_snapshots
       (agency_id, client_id, platform, entity_type, entity_external_id, stat_date, spend)
     VALUES ($1,$2,'tiktok','campaign','campA', now() - interval '1 day', 75),
            ($1,$2,'tiktok','campaign','campB', now() - interval '1 day', 60)
     ON CONFLICT (platform, entity_type, entity_external_id, stat_date) DO UPDATE SET spend=EXCLUDED.spend`,
    [A, C],
  );
  for (let i = 0; i < 25; i += 1) {
    const lead = await ingestLead(scope, {
      external_id: `A-${i}`, campaign_external_id: 'campA', platform: 'tiktok',
      stage: i < 2 ? 'qualified_lead' : i === 2 ? 'customer' : 'lead',
    });
    if (i === 2) await transitionLead(scope, lead.lead_id, { event: 'purchased', amount: 120 });
  }
  for (let i = 0; i < 10; i += 1) {
    const lead = await ingestLead(scope, {
      external_id: `B-${i}`, campaign_external_id: 'campB', platform: 'tiktok',
      stage: i < 4 ? 'customer' : 'qualified_lead',
    });
    if (i < 4) await transitionLead(scope, lead.lead_id, { event: 'purchased', amount: 120 });
  }

  const attribution = await attributionReport(scope, 7);
  console.log('ATTRIBUTION:', JSON.stringify(attribution.map((r) => ({ name: r.campaign_name, leads: r.leads, qualified: r.qualified, customers: r.customers, cpl: +r.cpl.toFixed(2), qualified_cpl: +r.qualified_cpl.toFixed(2), customer_cpa: +r.customer_cpa.toFixed(2) }))));

  const profit = await profitReport(scope, 7);
  console.log('PROFIT:', JSON.stringify(profit.map((r) => ({ name: r.campaign_name, revenue: r.revenue, ad_spend: r.ad_spend, contribution_profit: +r.contribution_profit.toFixed(2) }))));

  await pool.end();
  console.log('PHASE 6+7 VERIFICATION COMPLETE');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
