-- 001_core.sql — Tenancy, identity, connections
-- PostgreSQL dialect (run with psql / pg driver, not SQL Server).
-- gen_random_uuid() is built into PostgreSQL 13+ (no pgcrypto needed).

-- ── Agencies ──────────────────────────────────────────────
CREATE TABLE agencies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Users ─────────────────────────────────────────────────
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text,
  password_hash text,          -- optional (SSO later)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agency_members (
  agency_id  uuid NOT NULL REFERENCES agencies(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  role       text NOT NULL DEFAULT 'viewer'
             CHECK (role IN ('owner','admin','media_buyer','analyst','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, user_id)
);

-- ── Clients (tenant root) ─────────────────────────────────
CREATE TABLE clients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id  uuid NOT NULL REFERENCES agencies(id),
  name       text NOT NULL,
  slug       text NOT NULL,
  status     text NOT NULL DEFAULT 'onboarded'
             CHECK (status IN ('onboarded','active','paused','offboarded')),
  timezone   text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, slug)
);
CREATE INDEX idx_clients_agency ON clients (agency_id);

CREATE TABLE client_members (
  agency_id  uuid NOT NULL REFERENCES agencies(id),
  client_id  uuid NOT NULL REFERENCES clients(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  role       text NOT NULL DEFAULT 'viewer'
             CHECK (role IN ('owner','admin','media_buyer','analyst','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, user_id)
);

-- ── Connection Registry ───────────────────────────────────
-- credential_reference points at the server-side secret store — never a secret itself.
CREATE TABLE connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid NOT NULL REFERENCES agencies(id),
  client_id             uuid NOT NULL REFERENCES clients(id),
  provider              text NOT NULL CHECK (provider IN ('tiktok','meta','google')),
  external_account_id   text NOT NULL,
  advertiser_id         text,                       -- TikTok advertiser id (nullable elsewhere)
  credential_reference  text NOT NULL,
  permissions           jsonb NOT NULL DEFAULT '[]',
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','active','revoked')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  last_verified_at      timestamptz,
  UNIQUE (client_id, provider, external_account_id)
);
CREATE INDEX idx_connections_tenant ON connections (agency_id, client_id);

-- ── Ad Accounts ───────────────────────────────────────────
CREATE TABLE ad_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid NOT NULL REFERENCES agencies(id),
  client_id           uuid NOT NULL REFERENCES clients(id),
  connection_id       uuid NOT NULL REFERENCES connections(id),
  platform            text NOT NULL,
  external_account_id text NOT NULL,
  display_name        text,
  currency            text,
  timezone            text,
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform, external_account_id)
);
CREATE INDEX idx_ad_accounts_tenant ON ad_accounts (agency_id, client_id);

-- ── Row-Level Security (defense-in-depth; app-level is primary) ──
ALTER TABLE clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_accounts    ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_agency_scope ON clients
  USING (agency_id = current_setting('app.agency_id', true)::uuid);

CREATE POLICY connections_tenant_scope ON connections
  USING (agency_id = current_setting('app.agency_id', true)::uuid
         AND (current_setting('app.client_id', true) IS NULL
              OR client_id = current_setting('app.client_id', true)::uuid));

CREATE POLICY ad_accounts_tenant_scope ON ad_accounts
  USING (agency_id = current_setting('app.agency_id', true)::uuid
         AND (current_setting('app.client_id', true) IS NULL
              OR client_id = current_setting('app.client_id', true)::uuid));
