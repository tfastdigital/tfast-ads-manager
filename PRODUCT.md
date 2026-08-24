# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are TFast agency owners and operators managing advertising work across multiple client accounts. Clients are managed records and workspaces, not the primary dashboard users.

## Product Purpose

TFast Ads Manager gives an agency one operating surface for monitoring portfolio performance, investigating client accounts, running research and analysis, managing platform connections, and executing advertising changes through controlled automation.

## Positioning

The product combines agency-wide intelligence with client-scoped ad-platform execution. Every write travels through dry-run, policy, budget, approval, and audit controls rather than allowing an AI agent to mutate live campaigns directly.

## Operating Context

Agency staff use the dashboard throughout the workday to review a morning brief, identify accounts requiring attention, inspect performance and attribution, connect ad platforms, run synchronized analysis, review experiments, and approve proposed actions.

## Capabilities and Constraints

- Multi-tenant agency and client isolation is enforced server-side.
- TikTok, Meta, and Google integrations are represented; TikTok MCP is the current primary live execution path.
- TikTok OAuth credentials remain encrypted and server-side.
- Automated data synchronization and analysis may run without approval; ad-platform mutations retain mandatory safety and approval gates.
- The frontend is a dependency-free HTML, CSS, and JavaScript SPA served by Fastify.
- Development authentication is not a production login system.

## Brand Commitments

Preserve the TFast Ads Manager name and the supplied TFast logo assets. Product language should be direct, operational, and trustworthy rather than promotional.

## Evidence on Hand

- Product architecture and safety model in `docs/`.
- Existing live dashboard capabilities in `web/` and `server/src/routes.ts`.
- Brand assets in `assets/logo-light.png`, `assets/logo-dark.png`, and `assets/icon.svg`.
- Seeded sample performance data exists for development demonstrations; it must not be presented as a real customer claim.

## Product Principles

- Put exceptions and decisions ahead of passive reporting.
- Make automation state and safety boundaries obvious.
- Keep every client action visibly scoped to that client.
- Prefer fast scanning and decisive controls over decorative dashboard chrome.
- Explain failures with a concrete recovery action.

## Accessibility & Inclusion

The operational interface must remain keyboard accessible, responsive for quick mobile checks, readable at common desktop zoom levels, and must not rely on color alone to communicate status.
