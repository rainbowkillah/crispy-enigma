# Multi-Account Auth (Cloudflare Tokens)

This repo supports multiple Cloudflare accounts, one per production tenant. Deploy and drift checks must use the correct token per tenant.

## Token Strategy

Use **one API token per tenant** and keep it scoped to that tenant’s Cloudflare account.

Recommended scopes:
- Account Settings: Read
- Workers Scripts: Edit
- Vectorize: Read (for `npm run validate -- --remote`)
- Add KV/D1/DO write scopes only if you manage those resources via Wrangler

## Token Naming Convention

`deploy-tenant` and `deploy-all` resolve tokens in this order:

1. `CLOUDFLARE_API_TOKEN_<TENANT>`
2. `CLOUDFLARE_API_TOKEN` (fallback)

`<TENANT>` is uppercased with non-alphanumerics replaced by `_`.

Examples:
- `CLOUDFLARE_API_TOKEN_MRRAINBOWSMOKE`
- `CLOUDFLARE_API_TOKEN_RAINBOWSMOKEOFFICIAL`

## Local Setup

Each tenant has local env files:
- `tenants/<tenant>/.env` (default)
- `tenants/<tenant>/.env.stg` (staging)
- `tenants/<tenant>/.env.dev` (local dev)

`deploy-all` automatically loads the matching env file (staging uses `.env.stg` if present), and sets the per-tenant token internally.

Manual usage examples:

```bash
# Single tenant deploy
set -a; source tenants/mrrainbowsmoke/.env.stg; set +a
npm run deploy -- --tenant=mrrainbowsmoke --env=staging

# Drift check
set -a; source tenants/mrrainbowsmoke/.env.stg; set +a
npm run drift -- --tenant=mrrainbowsmoke --env=staging
```

## CI/CD Setup

In CI, set per-tenant secrets and expose them as environment variables:

- `CLOUDFLARE_API_TOKEN_MRRAINBOWSMOKE`
- `CLOUDFLARE_API_TOKEN_RAINBOWSMOKEOFFICIAL`

Then run:

```bash
npm run deploy:all -- --env=staging
```

## Troubleshooting

- **Authentication error (code 10000):** Token is invalid or belongs to the wrong account.
- **Worker does not exist (code 10007):** Script name not deployed in that account.
- **Vectorize index missing (code 10159):** Create index in that tenant account before deploy.
