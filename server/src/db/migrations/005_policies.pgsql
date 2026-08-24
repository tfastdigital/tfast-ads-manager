-- 005_policies.sql — Automation modes, budget limits, emergency stops
-- PostgreSQL dialect (run with psql / pg driver, not SQL Server).

-- ── Automation policies: per client, per action type ──────
CREATE TABLE automation_policies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid NOT NULL,
  client_id        uuid NOT NULL,
  action_type      text NOT NULL,   -- pause_underperforming_ad, scale_budget_under_15_percent,
                                    -- create_new_ad, launch_campaign, change_budget_over_25_percent,
                                    -- change_billing ...
  mode             text NOT NULL CHECK (mode IN
                     ('advisory','approval','autopilot','owner_approval','forbidden')),
  min_approval_role text NOT NULL DEFAULT 'media_buyer',
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, action_type)
);

-- Seed the example policy set for new clients (copy in app code).
-- INSERT INTO automation_policies (agency_id, client_id, action_type, mode, min_approval_role) VALUES
--   (?, ?, 'pause_underperforming_ad',    'autopilot',      'media_buyer'),
--   (?, ?, 'scale_budget_under_15_percent','autopilot',      'media_buyer'),
--   (?, ?, 'create_new_ad',               'approval',       'media_buyer'),
--   (?, ?, 'launch_campaign',             'approval',       'admin'),
--   (?, ?, 'change_budget_over_25_percent','owner_approval', 'owner'),
--   (?, ?, 'change_billing',              'forbidden',      'owner');

-- ── Budget limits (Budget Governor inputs) ────────────────
CREATE TABLE budget_limits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL,
  client_id     uuid NOT NULL,
  ad_account_id uuid,               -- NULL ⇒ client-wide
  scope         text NOT NULL CHECK (scope IN ('account','campaign')),
  kind          text NOT NULL CHECK (kind IN
                  ('daily_max','monthly_max','auto_scale_max_increase',
                   'auto_scale_max_decrease','max_new_campaigns_per_day')),
  value         jsonb NOT NULL,     -- { amount, currency } | { count } | { percent }
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, ad_account_id, scope, kind)
);

-- ── Emergency stop (hard kill switch) ─────────────────────
CREATE TABLE emergency_stops (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL,
  client_id      uuid NOT NULL,
  ad_account_id  uuid,
  active         boolean NOT NULL DEFAULT true,
  reason         text,
  activated_by   uuid,
  activated_at   timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);
CREATE INDEX idx_emergency_stops_active ON emergency_stops (client_id, active);

-- ── Automation runs (Morning Brief & pipeline jobs) ───────
CREATE TABLE automation_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id  uuid NOT NULL,
  client_id  uuid,                  -- NULL ⇒ agency-wide run
  rule_name  text NOT NULL,         -- morning_brief / anomaly_detection / fatigue_scan ...
  trigger    jsonb,
  findings   jsonb,                 -- severity-ranked findings
  severity   text CHECK (severity IN ('critical','warning','info')),
  status     text NOT NULL DEFAULT 'running'
             CHECK (status IN ('running','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX idx_automation_runs_tenant ON automation_runs (agency_id, client_id, created_at DESC);

ALTER TABLE automation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_limits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_stops    ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs    ENABLE ROW LEVEL SECURITY;
