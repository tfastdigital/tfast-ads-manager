-- 002_ads.sql — Advertising objects, creatives, performance
-- PostgreSQL dialect (run with psql / pg driver, not SQL Server).

-- ── Campaigns ─────────────────────────────────────────────
CREATE TABLE campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL,
  client_id     uuid NOT NULL,
  ad_account_id uuid NOT NULL REFERENCES ad_accounts(id),
  platform      text NOT NULL,
  external_id   text NOT NULL,
  name          text,
  objective     text,
  status        text,
  budget        jsonb,                 -- { type: 'campaign'|'adgroup', daily, lifetime, currency }
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, platform, external_id)
);
CREATE INDEX idx_campaigns_tenant ON campaigns (agency_id, client_id);

-- ── Ad Groups (unified: TikTok ad groups / Meta ad sets / Google ad groups) ──
CREATE TABLE ad_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL,
  client_id       uuid NOT NULL,
  ad_account_id   uuid NOT NULL REFERENCES ad_accounts(id),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  platform        text NOT NULL,
  external_id     text NOT NULL,
  name            text,
  optimization_goal text,
  conversion_event text,
  bid_strategy    text,
  status          text,
  targeting       jsonb,
  budget          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, platform, external_id)
);
CREATE INDEX idx_ad_groups_tenant ON ad_groups (agency_id, client_id);
CREATE INDEX idx_ad_groups_campaign ON ad_groups (campaign_id);

-- ── Ads ───────────────────────────────────────────────────
CREATE TABLE ads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL,
  client_id     uuid NOT NULL,
  ad_account_id uuid NOT NULL REFERENCES ad_accounts(id),
  ad_group_id   uuid NOT NULL REFERENCES ad_groups(id),
  platform      text NOT NULL,
  external_id   text NOT NULL,
  name          text,
  status        text,
  is_spark      boolean NOT NULL DEFAULT false,   -- TikTok Spark Ads
  is_aco        boolean NOT NULL DEFAULT false,   -- Automated Creative Optimization
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, platform, external_id)
);
CREATE INDEX idx_ads_tenant ON ads (agency_id, client_id);
CREATE INDEX idx_ads_ad_group ON ads (ad_group_id);

-- ── Creatives & Variants ──────────────────────────────────
CREATE TABLE creatives (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid NOT NULL,
  client_id        uuid NOT NULL,
  platform         text NOT NULL,
  external_id      text,
  media_type       text NOT NULL CHECK (media_type IN ('video','image','carousel')),
  asset_url        text,
  duration_seconds numeric,
  spark_organic    boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_creatives_tenant ON creatives (agency_id, client_id);

CREATE TABLE creative_variants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid NOT NULL REFERENCES creatives(id),
  variant_label text,
  asset_url   text,
  attributes  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Creative Intelligence Memory ──────────────────────────
-- Structured characteristics — not files — joined with performance
-- to discover which attributes correlate with results.
CREATE TABLE creative_attributes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id       uuid NOT NULL REFERENCES creatives(id),
  client_id         uuid NOT NULL,
  platform          text NOT NULL,
  format            text,               -- ugc / talking_head / demo / skit / before_after ...
  hook              text,               -- "Stop wasting money on..."
  hook_type         text,               -- contrarian / curiosity / social_proof ...
  presenter_type    text,               -- customer / founder / creator / voiceover
  opening_style     text,               -- face_to_camera / text_overlay / product_shot ...
  duration_seconds  int,
  problem           text,               -- high_price / complexity / distrust ...
  emotions          jsonb,              -- ["frustration","relief"]
  offer             text,               -- free_consultation / discount ...
  cta               text,               -- book_now / shop_now ...
  caption_style     text,               -- dynamic_subtitles / none ...
  extra             jsonb,
  extracted_by      text,               -- agent + model
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creative_id)
);
CREATE INDEX idx_creative_attrs_client ON creative_attributes (client_id, platform);

-- ── Audiences ─────────────────────────────────────────────
CREATE TABLE audiences (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL,
  client_id      uuid NOT NULL,
  platform       text NOT NULL,
  external_id    text,
  name           text,
  type           text CHECK (type IN ('broad','interest','lookalike','custom','retargeting')),
  targeting      jsonb,
  size_estimate  bigint,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audiences_tenant ON audiences (agency_id, client_id);

-- ── Unified Performance Snapshots ─────────────────────────
CREATE TABLE performance_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid NOT NULL,
  client_id             uuid NOT NULL,
  platform              text NOT NULL,
  entity_type           text NOT NULL CHECK (entity_type IN ('account','campaign','ad_group','ad','creative')),
  entity_external_id    text NOT NULL,
  stat_date             date NOT NULL,
  spend                 numeric(14,2) DEFAULT 0,
  impressions           bigint DEFAULT 0,
  clicks                bigint DEFAULT 0,
  ctr                   numeric(8,4),
  cpc                   numeric(14,4),
  cpm                   numeric(14,4),
  reach                 bigint,
  frequency             numeric(8,2),
  conversions           numeric(12,2) DEFAULT 0,
  cost_per_conversion   numeric(14,4),
  conversion_rate       numeric(8,4),
  video_play_actions    bigint,
  video_watched_2s      bigint,
  video_watched_6s      bigint,
  video_views_p100      bigint,
  total_purchase_value  numeric(14,2),
  revenue               numeric(14,2),
  extra                 jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, entity_type, entity_external_id, stat_date)
);
CREATE INDEX idx_snapshots_tenant_date ON performance_snapshots (agency_id, client_id, stat_date DESC);
CREATE INDEX idx_snapshots_entity ON performance_snapshots (platform, entity_type, entity_external_id);

-- ── Conversion Events (platform-reported) ─────────────────
CREATE TABLE conversion_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid NOT NULL,
  client_id             uuid NOT NULL,
  platform              text NOT NULL,
  external_id           text,
  event_name            text NOT NULL,
  event_time            timestamptz NOT NULL,
  value                 numeric(14,2),
  currency              text,
  attributed_campaign_id uuid,
  attributed_ad_id      uuid,
  attribution_window    jsonb,           -- {"click_days":7,"view_days":1}
  raw                   jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversion_events_tenant ON conversion_events (agency_id, client_id, event_time DESC);

ALTER TABLE campaigns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE creatives             ENABLE ROW LEVEL SECURITY;
ALTER TABLE creative_attributes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audiences             ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_events     ENABLE ROW LEVEL SECURITY;
