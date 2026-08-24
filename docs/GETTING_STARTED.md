# Getting Started

Setup guide for TFast Ads Manager: install the stack, obtain API credentials, register your business with the ad platforms, and connect your first client account.

---

## 1. Prerequisites

- Node.js 20+ and npm 10+
- Git
- Docker Desktop (recommended — PostgreSQL 16 + pgvector) or a PostgreSQL 16+ server with the `pgvector` extension
- A TikTok for Business account (for TikTok workflows)
- API keys: OpenAI, DeepSeek, API Direct (see step 3)

For development without Docker, the server falls back to PGlite (a single-file, in-process PostgreSQL). PGlite is single-process: do not run the server and scripts against the same data directory at the same time.

---

## 2. Clone and install

```bash
git clone https://github.com/tfastdigital/tfast-ads-manager.git
cd tfast-ads-manager/server
npm install
```

---

## 3. Obtain API keys

These keys power the AI and research layers. Each provider has its own signup:

| Key | Where to get it |
|---|---|
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) → API keys → Create new secret key |
| `DEEPSEEK_API_KEY` | [platform.deepseek.com](https://platform.deepseek.com/) → API Keys → Create |
| `APIDIRECT_API_KEY` | [apidirect.io](https://apidirect.io) — paid market/social intelligence service; keys are issued in the dashboard |

Set spend limits on each provider before use.

---

## 4. Configure environment

```powershell
Copy-Item .env.example .env   # Windows
cp .env.example .env          # macOS / Linux
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Minimum `.env` values:

```dotenv
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
APIDIRECT_API_KEY=
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tfast
JWT_SECRET=
ADMIN_EMAIL=
ADMIN_NAME=
ADMIN_PASSWORD=
```

Never commit `.env`. In production, keep `JWT_SECRET` in a secrets manager, not on disk next to the repo.

---

## 5. Register your business with the ad platforms

### TikTok for Business

The TikTok integration uses the **official TikTok for Business MCP Server** and authorizes through OAuth 2.0 with PKCE and dynamic client registration. No API key is required for the MCP flow, but you need a Business Center with at least one advertiser account.

1. **Create a Business Center** — go to [business.tiktok.com](https://business.tiktok.com), sign up or log in, and complete company verification (legal name, address, business documents). Verification can take 1–3 business days.
2. **Create an advertiser account** — in Business Center → Assets → Advertiser Accounts → Create. This produces the advertiser ID you will select when connecting a client in TFast.
3. **Add billing and verification** — Business Center → Finance. Payment methods and billing verification stay in TikTok; TFast never stores payment details.
4. **OAuth callback URL** — TFast uses `TIKTOK_MCP_REDIRECT_URI` (default `http://127.0.0.1:8787/api/v1/oauth/tiktok-mcp/callback`). For production deployments set this to your public HTTPS URL.

Optional — Marketing API developer app (only needed for the legacy app-based OAuth path, not the MCP flow):

1. Register a developer account at [developers.tiktok.com](https://developers.tiktok.com).
2. Create an app, note the **App ID** and **App Secret**, and set the redirect URI in the app console.
3. Fill `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_REDIRECT_URI` in `.env`.

### Meta (Facebook / Instagram)

1. Create a [Business Manager](https://business.facebook.com) (business.facebook.com → Create account).
2. Create a developer app at [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App → type "Business".
3. Add the **Marketing API** product to the app.
4. Complete **App Review** and request the ads permissions you need (`ads_management`, `ads_read`). Standard access supports your own ad accounts; advanced access is required to manage other businesses' accounts.
5. Configure `META_MCP_URL` / `META_MCP_TOKEN` in `.env` when you enable the Meta gateway (gateway is extensible; connections are managed per client in the TFast UI).

### Google Ads

1. Create a **manager account (MCC)** at [ads.google.com](https://ads.google.com) → Tools → Manager accounts. Link client accounts under it.
2. Create a Google Cloud project and enable the **Google Ads API**.
3. Create OAuth 2.0 credentials and generate a **developer token** (API Center → Developer token; standard access is sufficient for your own accounts).
4. Complete the OAuth consent screen and get a refresh token for the MCC.
5. Configure `GOOGLE_MCP_URL` / `GOOGLE_MCP_TOKEN` in `.env` when you enable the Google gateway.

---

## 6. Start PostgreSQL

```bash
cd server
docker compose up -d
```

Or point `DATABASE_URL` at your own PostgreSQL 16+ instance with `pgvector` installed.

---

## 7. Migrate and seed

```bash
npm run migrate
npm run seed
```

Seed prints the development agency, user and client IDs. Development login (`dev-login`) accepts those IDs and is refused when `NODE_ENV=production`.

---

## 8. Run the server

```bash
npm run dev
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787) and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

---

## 9. Connect your first client

1. **Clients → Add client** — name and workspace slug.
2. **Client workspace → Connections → TikTok → Connect with OAuth**.
3. Sign in to TikTok and approve the requested MCP permissions. You are redirected back to TFast with a success or error status.
4. Select the advertiser account and run **Test connection**.

For local development without a TikTok login, set `TIKTOK_MOCK_OAUTH=true` to exercise the flow against a mock.

---

## 10. Verify the installation

Run from `server/` (stop the dev server first — PGlite is single-process):

```bash
npm run verify:pipeline
npm run verify:business
npm run verify:ai
```

---

## 11. Production checklist

- HTTPS termination in front of the server; update all OAuth redirect URIs.
- `NODE_ENV=production` (disables development login).
- Managed PostgreSQL with pgvector, backups, and a secrets manager.
- A durable scheduler (queue or cron) instead of the in-process dev scheduler.
- Restrict OAuth scopes to the minimum; rotate credentials regularly.
- Configure per-client budget policies before enabling autopilot modes.
- See [Security](SECURITY_MODEL.md) before exposing the API.
