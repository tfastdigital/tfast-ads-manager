-- 004_business.sql — CRM, revenue, attribution, profit
-- PostgreSQL dialect (run with psql / pg driver, not SQL Server).

-- ── Leads (staged journey) ────────────────────────────────
CREATE TABLE leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid NOT NULL,
  client_id        uuid NOT NULL,
  external_id      text,
  source_campaign_id uuid,
  source_ad_id     uuid,
  platform         text,
  contact          jsonb,
  stage            text NOT NULL DEFAULT 'lead' CHECK (stage IN
                     ('lead','qualified_lead','appointment','show','customer')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  qualified_at     timestamptz,
  converted_at     timestamptz,
  UNIQUE (client_id, external_id)
);
CREATE INDEX idx_leads_tenant ON leads (agency_id, client_id);
CREATE INDEX idx_leads_campaign ON leads (source_campaign_id, stage);

-- Journey trace — one row per stage transition
CREATE TABLE lead_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES leads(id),
  event       text NOT NULL CHECK (event IN
                ('created','qualified','appointment','showed','purchased','refunded')),
  amount      numeric(14,2),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_events_lead ON lead_events (lead_id, occurred_at);

-- ── Customers ─────────────────────────────────────────────
CREATE TABLE customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid REFERENCES leads(id),
  client_id         uuid NOT NULL,
  first_purchase_at timestamptz,
  ltv               numeric(14,2) DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── Purchases (revenue + cost decomposition for profit) ───
CREATE TABLE purchases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL,
  client_id   uuid NOT NULL,
  customer_id uuid REFERENCES customers(id),
  lead_id     uuid REFERENCES leads(id),
  order_ref   text,
  revenue     numeric(14,2) NOT NULL DEFAULT 0,
  costs       jsonb NOT NULL DEFAULT '{}',  -- { cogs, payment_fees, shipping, discounts, sales_commissions }
  refunds     numeric(14,2) NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchases_tenant ON purchases (agency_id, client_id, occurred_at DESC);

-- ── Revenue events (CRM / ecommerce / booking / payments) ─
CREATE TABLE revenue_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL,
  client_id   uuid NOT NULL,
  source      text NOT NULL CHECK (source IN ('crm','ecommerce','booking','payments')),
  external_id text,
  type        text NOT NULL CHECK (type IN ('purchase','refund')),
  amount      numeric(14,2) NOT NULL,
  currency    text,
  fees        jsonb,
  customer_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_revenue_events_tenant ON revenue_events (agency_id, client_id, occurred_at DESC);

-- ── Attribution (platform ↔ business outcomes) ────────────
CREATE TABLE attribution (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL,
  client_id   uuid NOT NULL,
  event_id    uuid NOT NULL,                  -- conversion_events.id or revenue_events.id
  event_source text NOT NULL CHECK (event_source IN ('conversion','revenue')),
  campaign_id uuid,
  ad_id       uuid,
  platform    text,
  model       text NOT NULL CHECK (model IN ('last_click','view_through','first_touch')),
  credit      numeric(14,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attribution_tenant ON attribution (agency_id, client_id);

ALTER TABLE leads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribution    ENABLE ROW LEVEL SECURITY;
