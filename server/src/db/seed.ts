/**
 * Seed — idempotent bootstrap for local development.
 * Creates the TFast Digital Agency, a dev user, a sample client, the
 * §13 default automation policy set, and baseline budget limits.
 * Run: npm run seed
 */
import { randomUUID } from 'node:crypto';
import { pool } from './pool.js';
import { hashPassword } from '../http/auth.js';

export async function seed(): Promise<void> {
  const requestedAgencyId = randomUUID();
  const requestedUserId = randomUUID();
  const requestedClientId = randomUUID();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminName = process.env.ADMIN_NAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;

  const agencyResult = await pool.query<{ id: string }>(
    `INSERT INTO agencies (id, name, slug) VALUES ($1, 'TFast Digital Agency', 'tfast')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [requestedAgencyId],
  );
  const agencyId = agencyResult.rows[0].id;
  if (adminEmail && adminName && adminPassword) {
    const adminId = randomUUID();
    const passwordHash = hashPassword(adminPassword);
    const admin = await pool.query<{ id: string }>(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [adminId, adminEmail, adminName, passwordHash],
    );
    await pool.query(
      `INSERT INTO agency_members (agency_id, user_id, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (agency_id, user_id) DO UPDATE SET role = 'admin'`,
      [agencyId, admin.rows[0].id],
    );
  }
  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO users (id, email, name) VALUES ($1, 'dev@tfast.example', 'Dev User')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [requestedUserId],
  );
  const userId = userResult.rows[0].id;
  await pool.query(
    `INSERT INTO agency_members (agency_id, user_id, role) VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [agencyId, userId],
  );
  await pool.query(
    `INSERT INTO clients (id, agency_id, name, slug) VALUES ($1, $2, 'Sample Client', 'sample-client')
     ON CONFLICT (agency_id, slug) DO NOTHING`,
    [requestedClientId, agencyId],
  );
  const clientResult = await pool.query<{ id: string }>(
    `SELECT id FROM clients WHERE agency_id = $1 AND slug = 'sample-client' LIMIT 1`,
    [agencyId],
  );
  const clientId = clientResult.rows[0].id;

  // §13 example policy set
  const policies: Array<[string, 'advisory' | 'approval' | 'autopilot' | 'owner_approval' | 'forbidden', string]> = [
    ['pause_underperforming_ad', 'autopilot', 'media_buyer'],
    ['scale_budget_under_15_percent', 'autopilot', 'media_buyer'],
    ['create_new_ad', 'approval', 'media_buyer'],
    ['launch_campaign', 'approval', 'admin'],
    ['change_budget_over_25_percent', 'owner_approval', 'owner'],
    ['change_billing', 'forbidden', 'owner'],
  ];
  for (const [action, mode, role] of policies) {
    await pool.query(
      `INSERT INTO automation_policies (agency_id, client_id, action_type, mode, min_approval_role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id, action_type) DO NOTHING`,
      [agencyId, clientId, action, mode, role],
    );
  }

  // §14 budget limits
  const limits: Array<[string, string, string]> = [
    ['account', 'daily_max', '{"amount": 500, "currency": "USD"}'],
    ['account', 'monthly_max', '{"amount": 10000, "currency": "USD"}'],
    ['account', 'auto_scale_max_increase', '{"percent": 30}'],
    ['account', 'auto_scale_max_decrease', '{"percent": 50}'],
    ['account', 'max_new_campaigns_per_day', '{"count": 3}'],
  ];
  for (const [scope, kind, value] of limits) {
    await pool.query(
      `INSERT INTO budget_limits (agency_id, client_id, scope, kind, value)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (client_id, ad_account_id, scope, kind) DO NOTHING`,
      [agencyId, clientId, scope, kind, value],
    );
  }

  // Starter Client Brain (§4)
  await pool.query(
    `INSERT INTO client_brains (agency_id, client_id, section, content)
     VALUES ($1, $2, 'business', $3::jsonb), ($1, $2, 'economics', $4::jsonb)
     ON CONFLICT (client_id, section) DO NOTHING`,
    [
      agencyId, clientId,
      JSON.stringify({ company_name: 'Sample Client', industry: 'DTC ecommerce', website: 'https://example.com' }),
      JSON.stringify({ target_roas: 3, target_cpa: 20, monthly_budget: 10000, aov: 60 }),
    ],
  );

  console.log('Seed complete.');
  console.log(`  agency_id: ${agencyId}`);
  console.log(`  user_id:   ${userId} (dev@tfast.example, role owner)`);
  console.log(`  client_id: ${clientId}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
