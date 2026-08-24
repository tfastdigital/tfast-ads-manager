-- 006_oauth.pgsql — OAuth flow state + server-side secret store
-- PostgreSQL dialect (run with psql / pg driver, not SQL Server).
--
-- SECURITY: oauth_tokens holds ENCRYPTED payloads (AES-256-GCM, key derived
-- from JWT_SECRET). The connections table only ever stores a reference.
-- Production should replace the app-level encryption with a KMS-backed store.

CREATE TABLE oauth_states (
  state        text PRIMARY KEY,
  agency_id    uuid NOT NULL,
  client_id    uuid NOT NULL,
  user_id      uuid NOT NULL,
  provider     text NOT NULL CHECK (provider IN ('tiktok','meta','google')),
  redirect_back text,                 -- where the dashboard should land after auth
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz
);

CREATE TABLE secret_store (
  reference  text PRIMARY KEY,        -- e.g. 'tiktok:oauth:<connection-uuid>'
  agency_id  uuid NOT NULL,
  client_id  uuid NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('oauth_token','api_key','mcp_token')),
  value      jsonb NOT NULL,          -- { enc: 'iv:tag:ciphertext' } encrypted payload
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_secret_store_tenant ON secret_store (agency_id, client_id);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_store ENABLE ROW LEVEL SECURITY;
