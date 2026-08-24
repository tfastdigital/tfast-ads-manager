# TFast Agency Command Center — Web Dashboard

Zero-build SPA (plain HTML/CSS/JS) served by the Fastify server at `/`.

## What's here

- **Command Center** (§16) — agency totals (spend, revenue, ROAS, leads, qualified leads, CPA, CPL), client status table, and the full `# TFast Morning Brief` with all 7 sections.
- **Clients** (§17) — client list + add-client, and a per-client workspace with 8 tabs: Overview · Performance · Attribution · Profit · Experiments · Approvals · Research · Client Brain (view + edit).
- **Ask TFast AI** (§24) — chat with the Agency Commander (`/api/v1/ai/ask`).
- **Reports** — Morning Brief history from `automation_runs`.

## How it runs

- `server/src/web.ts` serves `/` (index.html), `/app.js`, `/styles.css` — no build step, no frontend dependencies.
- UI files are public; **every `/api/*` route requires a Bearer token** (session middleware). Tenant isolation + RBAC are enforced server-side — the UI can never render another client's data.
- **No provider credentials in frontend code** (§25) — all keys stay in server-side `.env`.

## Login (development)

The login screen uses `/api/v1/auth/dev-login` (server refuses it when `NODE_ENV=production`). Use the IDs printed by `npm run seed`. Replace with the real SSO/OIDC flow before production, and rotate `JWT_SECRET`.

## Hard rules kept

- One client can never see another client's data (server-enforced).
- Approvals execute the **stored** parameters — the UI cannot modify a pending action.
- All mutations flow through dry-run → approval → budget governor → audit.
