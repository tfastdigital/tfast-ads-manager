# TFast Ads Manager

<p align="center">
  <strong>AI-powered advertising command center for agencies and performance marketers.</strong><br>
  Built by <a href="https://tfastdigital.com/"><strong>TFast Digital Agency</strong></a>.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-9acd32"></a>
  <img alt="Node 20+" src="https://img.shields.io/badge/Node.js-20%2B-339933">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.5-3178c6">
  <img alt="TikTok MCP" src="https://img.shields.io/badge/TikTok-MCP-000000">
</p>

TFast Ads Manager combines live advertising data, AI research, multi-client workflows, deterministic budget controls, approvals, attribution and performance reporting in one agency workspace. It connects to the official TikTok for Business MCP Server and includes extensible Meta and Google Ads gateways.

> This project can perform advertising actions. Keep approval gates enabled, use least-privilege credentials and test with small budgets before production use.

## What it does

- Connects TikTok for Business through OAuth 2.0, PKCE and dynamic client registration.
- Discovers and calls official TikTok MCP tools for reporting and guarded operations.
- Syncs TikTok, Meta and Google Ads campaign, ad-set/ad-group and ad performance into PostgreSQL/pgvector.
- Researches competitors, trends and customer language through API Direct.
- Produces AI-assisted morning briefs, diagnoses and recommendations.
- Supports multi-client workspaces and client-specific knowledge.
- Tracks leads, revenue, attribution, CPA, ROAS and profit signals.
- Protects writes with dry runs, approvals, budget limits and audit logs.
- Includes 68 advertising skills across TikTok, Meta, Google Ads, creative, strategy, optimization and attribution.
- Provides a responsive browser dashboard and server-side authentication.

## Architecture

```text
Browser dashboard
      |
Fastify API + tenant/RBAC layer
      |
Agent router + deterministic safety pipeline
      |---------------- TikTok for Business MCP
      |---------------- API Direct research
      |---------------- OpenAI / DeepSeek
      |---------------- Meta / Google MCP gateways
      |
PostgreSQL + pgvector (PGlite fallback for development)
```

Documentation: [Getting Started](docs/GETTING_STARTED.md) · [Architecture](docs/ARCHITECTURE.md) · [Agents](docs/AGENT_ARCHITECTURE.md) · [Database](docs/DATABASE_SCHEMA.md) · [Security](docs/SECURITY_MODEL.md)

## Requirements

- Node.js 20+
- npm 10+
- Git
- Modern Chromium browser
- Docker Desktop (recommended for PostgreSQL + pgvector)
- TikTok for Business account for live TikTok workflows
- OpenAI, DeepSeek and API Direct API keys

Production deployments should use managed PostgreSQL, HTTPS, a secrets manager and a durable job runner.

## Quick start

### 1. Clone

```bash
git clone https://github.com/tfastdigital/tfast-ads-manager.git
cd tfast-ads-manager
```

### 2. Configure environment

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set these required values in `.env`:

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

Never commit `.env`, OAuth tokens, API keys, passwords or payment data.

### 3. Start PostgreSQL

```bash
cd server
docker compose up -d
```

The server can use PGlite as a zero-install development fallback when PostgreSQL is unavailable.

### 4. Install, migrate and seed

```bash
cd server
npm install
npm run migrate
npm run seed
```

### 5. Run

```bash
npm run dev
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787) and sign in with the admin credentials from `.env`.

## Connect TikTok for Business

1. Create a TikTok Business Center and advertiser account.
2. Add billing and verification directly in TikTok—never store payment details here.
3. Open **Clients → Connect TikTok** in TFast.
4. Select **Connect with OAuth**.
5. Review and authorize TikTok MCP permissions.
6. Return to TFast and select **Test connection**.

Recommended live configuration:

```dotenv
TIKTOK_MCP_URL=https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer
TIKTOK_MCP_REDIRECT_URI=http://127.0.0.1:8787/api/v1/oauth/tiktok-mcp/callback
TIKTOK_MOCK_OAUTH=false
```

The layered MCP endpoint exposes a smaller core tool catalog through progressive disclosure. TFast maps TikTok's integrated reporting tool to advertiser, campaign, ad-group and ad reporting workflows.

## API Direct research

Set `APIDIRECT_API_KEY`, then open **Client workspace → Research**. Default research uses TikTok, Reddit, YouTube and web search, balances results across sources and sends structured evidence to the market-intelligence agent.

API Direct is a paid service. Configure daily and monthly spending limits before scheduled use.

## Automated workflow

**Run full cycle** performs:

1. Reporting sync for TikTok, Meta and Google Ads (previous 30 days).
2. Campaign/ad-group/ad normalization and storage.
3. Portfolio analysis and anomaly detection.
4. Morning Brief generation.
5. Guarded recommendations and pending approvals.

Optional development scheduler:

```dotenv
MORNING_BRIEF_INTERVAL_HOURS=24
TIKTOK_SYNC_INTERVAL_HOURS=6
META_SYNC_INTERVAL_HOURS=6
GOOGLE_SYNC_INTERVAL_HOURS=6
```

Use a durable queue or managed scheduler in production.

## Advertising safety

```text
resolve tenant/account → validate permissions → dry run → policy checks
→ budget governor → approval → authorized execution → audit log
```

Agents cannot choose arbitrary advertiser accounts, bypass approval state or silently raise configured budget limits.

## Commands

Run from `server/`:

```bash
npm run dev
npm run build
npm run migrate
npm run seed
npm run verify:pipeline
npm run verify:business
npm run verify:ai
```

## Repository layout

```text
commands/     Advertising workflow commands
docs/         Architecture, database and security documentation
hooks/        Agent/session integration hooks
server/       API, jobs, agents, MCP gateways and database
skills/       Advertising playbooks and specialist skills
web/          Browser dashboard
```

## Production checklist

- Use HTTPS and a production OAuth callback URL.
- Set `NODE_ENV=production` to disable development login.
- Store a unique `JWT_SECRET` outside the repository.
- Use managed secrets, backups and pgvector.
- Restrict OAuth scopes and rotate credentials regularly.
- Configure client-specific budget policies.
- Keep human approval enabled for spend-changing operations.
- Monitor sync failures, token refresh and scheduled jobs.
- Review privacy obligations for leads and customer data.

## SEO keywords

AI ads manager, advertising automation, TikTok Ads MCP, TikTok Marketing API, AI marketing agent, paid media automation, campaign optimization, ROAS optimization, agency dashboard, creative intelligence, competitor research, conversion tracking, attribution, budget optimization, PostgreSQL pgvector.

## Contributing

Issues and pull requests are welcome. Never include client data, private screenshots, API keys, OAuth tokens or advertiser identifiers in public reports or commits. See [SECURITY.md](SECURITY.md).

## License

Released under the [MIT License](LICENSE).

TFast Ads Manager is developed and maintained by [TFast Digital Agency](https://tfastdigital.com/).

## Support

- Website: [tfastdigital.com](https://tfastdigital.com/)
- Issues: [GitHub Issues](https://github.com/tfastdigital/tfast-ads-manager/issues)

---

<p align="center">
  Built by <a href="https://tfastdigital.com/"><strong>TFast Digital Agency</strong></a><br>
  AI-powered advertising systems for measurable growth.
</p>
