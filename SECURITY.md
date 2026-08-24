# Security Policy

## Reporting a vulnerability

Do not publish security vulnerabilities, credentials, advertiser identifiers or customer data in a public issue. Contact TFast Digital Agency through [tfastdigital.com](https://tfastdigital.com/) with a concise reproduction and affected version.

## Secret handling

- Never commit `.env` or environment-specific variants.
- Never include OAuth tokens, API keys, passwords, payment data or verification codes in issues, logs or screenshots.
- Rotate any credential that was accidentally exposed.
- Use a secrets manager and least-privilege OAuth scopes in production.

## Advertising safety

Keep dry runs, approval gates, budget policies and audit logging enabled. Validate all account mappings before authorizing spend-changing operations.
