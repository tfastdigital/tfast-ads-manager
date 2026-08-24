-- ── Complete TFast takeover: drop the legacy 'gomarble' provider value ──
-- Applied to existing databases; fresh installs already get the updated
-- CHECK constraint in 001_core.pgsql.

DELETE FROM connections WHERE provider = 'gomarble';

ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_provider_check;
ALTER TABLE connections ADD CONSTRAINT connections_provider_check
  CHECK (provider IN ('tiktok','meta','google'));
