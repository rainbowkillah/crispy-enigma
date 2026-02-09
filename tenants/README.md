# Multi-Tenant Configuration

This directory contains configuration files for each tenant.

## Tenant Structure

Each tenant folder contains:
- `tenant.config.json` - Tenant metadata (tenantId, account IDs, AI models)
- `wrangler.jsonc` - Cloudflare Workers configuration  
- `.env.example` - Environment variable template
- `.env.local` - Local overrides (git-ignored)

## Current Tenants

- **mrrainbowsmoke** - Dev/staging tenant
- **rainbowsmokeofficial** - Production tenant

## Adding a New Tenant

1. Copy an existing tenant folder as template
2. Update `tenant.config.json` with new `tenantId`
3. Configure `wrangler.jsonc` with your Cloudflare account
4. Copy `.env.example` to `.env.local`, fill in secrets
5. Run `npm run validate-config -- --tenant=<name>`

See individual tenant READMEs for setup instructions.
