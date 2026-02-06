# Quick Reference

## Tenants
- `mrrainbowsmoke`
- `rainbowsmokeofficial`

## Worker Names
- `bluey-ai-worker` (mrrainbowsmoke)
- `azure-ai-worker` (rainbowsmokeofficial)

## Bindings (shared names)
- Workers AI: `AI`
- KV: `RATE_LIMITER`, `CONFIG`, `CACHE`
- D1: `DB`
- Durable Objects: `RATE_LIMITER_DO`, `CHAT_SESSION`
- Vectorize (planned): `VECTORIZE`

## Tenant Config Paths
- `tenants/mrrainbowsmoke/tenant.config.json`
- `tenants/mrrainbowsmoke/wrangler.jsonc`
- `tenants/rainbowsmokeofficial/tenant.config.json`
- `tenants/rainbowsmokeofficial/wrangler.jsonc`

## Local Dev
- `pnpm tenants:generate`
- `pnpm dev --tenant=mrrainbowsmoke`
- `pnpm dev --tenant=rainbowsmokeofficial`

## Test
- `pnpm tenants:generate`
- `pnpm test`
