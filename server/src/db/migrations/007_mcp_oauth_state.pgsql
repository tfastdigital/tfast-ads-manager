-- 007_mcp_oauth_state.pgsql — state extras for the TikTok MCP server OAuth flow
-- PostgreSQL dialect (run with psql / pg driver, not SQL Server).
--
-- The MCP server flow (DCR + PKCE) needs to persist the PKCE code_verifier
-- and the exact redirect_uri between the authorize step and the token
-- exchange (the docs require a 1:1 redirect_uri match).

ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS code_verifier text;
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS redirect_uri  text;

-- Widen the provider check to admit the MCP-server flow ('tiktok-mcp').
ALTER TABLE oauth_states DROP CONSTRAINT IF EXISTS oauth_states_provider_check;
ALTER TABLE oauth_states ADD CONSTRAINT oauth_states_provider_check
  CHECK (provider IN ('tiktok','tiktok-mcp','meta','google'));
