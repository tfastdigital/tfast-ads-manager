-- 003_ai_memory.sql — Client brains, memory, research, experiments, agent governance
-- PostgreSQL dialect (run with psql / pg driver, not SQL Server).
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Client Brain ──────────────────────────────────────────
CREATE TABLE client_brains (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id  uuid NOT NULL,
  client_id  uuid NOT NULL REFERENCES clients(id),
  section    text NOT NULL CHECK (section IN
               ('business','brand','customers','economics',
                'advertising_history','competitors','ai_knowledge')),
  content    jsonb NOT NULL,
  version    int NOT NULL DEFAULT 1,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, section)
);
CREATE INDEX idx_brains_client ON client_brains (agency_id, client_id);

-- ── Memories: client-scoped + agency-scoped ──────────────
CREATE TABLE memories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL,
  client_id     uuid,                       -- NULL ⇒ agency-level
  scope         text NOT NULL CHECK (scope IN ('client','agency')),
  kind          text NOT NULL CHECK (kind IN ('fact','observation','hypothesis','lesson')),
  content       text NOT NULL,
  embedding     vector(1536),
  importance    smallint NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  is_anonymized boolean NOT NULL DEFAULT false,   -- REQUIRED true for agency-scope derived from client data
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_memories_client ON memories (agency_id, client_id);
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── Agency Knowledge (generalized, anonymized patterns) ───
CREATE TABLE agency_knowledge (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id  uuid NOT NULL,
  topic      text NOT NULL,
  pattern    jsonb NOT NULL,                 -- generalized pattern
  evidence   jsonb,                          -- anonymized supporting data
  embedding  vector(1536),
  confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agency_knowledge_embedding ON agency_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── Experiment Engine chain ──────────────────────────────
CREATE TABLE observations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id  uuid NOT NULL,
  client_id  uuid NOT NULL,
  entity_type text,
  entity_external_id text,
  metric     text,
  delta      numeric,
  window_days int,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hypotheses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid REFERENCES observations(id),
  agency_id      uuid NOT NULL,
  client_id      uuid NOT NULL,
  statement      text NOT NULL,
  rationale      text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE experiments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id uuid REFERENCES hypotheses(id),
  agency_id     uuid NOT NULL,
  client_id     uuid NOT NULL,
  title         text NOT NULL,
  status        text NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','running','completed','cancelled')),
  design        jsonb NOT NULL,               -- variants, success criteria, duration
  started_at    timestamptz,
  ended_at      timestamptz,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_experiments_client ON experiments (agency_id, client_id);

CREATE TABLE lessons (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id     uuid REFERENCES experiments(id),
  agency_id         uuid NOT NULL,
  client_id         uuid NOT NULL,
  content           text NOT NULL,
  confidence        numeric(4,3),
  promoted_to_memory boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Market intelligence (API Direct) ─────────────────────
CREATE TABLE competitors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id  uuid NOT NULL,
  client_id  uuid NOT NULL,
  name       text NOT NULL,
  website    text,
  socials    jsonb,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE research_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL,
  client_id    uuid NOT NULL,
  source       text NOT NULL DEFAULT 'apidirect',
  platform     text,                          -- tiktok/instagram/facebook/reddit/youtube/x/linkedin/web/forum
  kind         text NOT NULL CHECK (kind IN
                 ('competitor','viral','trend','complaint','question','language',
                  'offer','influencer','format','sentiment','strategy')),
  external_url text,
  content      jsonb NOT NULL,
  embedding    vector(1536),
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_research_items_client ON research_items (agency_id, client_id);
CREATE INDEX idx_research_items_embedding ON research_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE market_insights (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid NOT NULL,
  client_id        uuid NOT NULL,
  research_item_id uuid REFERENCES research_items(id),
  insight          text NOT NULL,
  category         text,
  confidence       numeric(4,3),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Agent runs & decisions ────────────────────────────────
CREATE TABLE agent_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id    uuid NOT NULL,
  client_id    uuid,
  agent        text NOT NULL,                  -- commander / strategist / analyst ...
  model        text NOT NULL,                  -- openai:... / deepseek:...
  input        jsonb NOT NULL,
  output       jsonb,
  status       text NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','succeeded','failed')),
  token_usage  jsonb,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX idx_agent_runs_tenant ON agent_runs (agency_id, client_id);

CREATE TABLE agent_decisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES agent_runs(id),
  agency_id    uuid NOT NULL,
  client_id    uuid,
  decision     text NOT NULL,
  reason       text,
  confidence   numeric(4,3),
  alternatives jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Tool calls (dry-run / execute) ────────────────────────
CREATE TABLE tool_calls (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id        uuid REFERENCES agent_runs(id),
  agency_id           uuid NOT NULL,
  client_id           uuid,
  ad_account_id       uuid,
  campaign_id         uuid,
  tool                text NOT NULL,
  mode                text NOT NULL CHECK (mode IN ('dry_run','execute')),
  proposed_parameters jsonb NOT NULL,
  policy_result       jsonb,
  approval_status     text CHECK (approval_status IN ('not_required','pending','approved','rejected','expired')),
  execution_result    jsonb,
  before_state        jsonb,
  after_state         jsonb,
  idempotency_key     text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_tool_calls_idempotency ON tool_calls (agency_id, idempotency_key);
CREATE INDEX idx_tool_calls_tenant ON tool_calls (agency_id, client_id);

-- ── Approvals ────────────────────────────────────────────
CREATE TABLE approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL,
  client_id     uuid NOT NULL,
  tool_call_id  uuid REFERENCES tool_calls(id),
  action_type   text NOT NULL,
  requested_by  uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','expired')),
  required_role text NOT NULL,
  decided_by    uuid,
  decided_at    timestamptz,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_approvals_pending ON approvals (client_id, status);

-- ── Audit log — append-only ──────────────────────────────
CREATE TABLE audit_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent               text,
  model               text,
  agency_id           uuid NOT NULL,
  client_id           uuid,
  account_id          uuid,
  campaign_id         uuid,
  actor               text NOT NULL,           -- user:<id> | agent:<name>
  action              text NOT NULL,
  input               jsonb,
  reason              text,
  decision            text,
  tool                text,
  proposed_parameters jsonb,
  policy_result       jsonb,
  approval_status     text,
  execution_result    jsonb,
  before_state        jsonb,
  after_state         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant ON audit_logs (agency_id, client_id, created_at DESC);
-- Append-only: no UPDATE/DELETE (enforced in app; trigger optional later)

ALTER TABLE client_brains    ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypotheses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_insights  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_calls       ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;
