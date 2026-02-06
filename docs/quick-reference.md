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
- `npm run tenants:generate`
- `npm run dev -- --tenant=mrrainbowsmoke`
- `npm run dev -- --tenant=rainbowsmokeofficial`
- `npm run dev -- --tenant=mrrainbowsmoke --env=dev`
- `npm run smoke:dev -- --tenant=mrrainbowsmoke`

## Wrangler
- Version pinned: `wrangler@4.20.0` (see `docs/wrangler.md`)

## Test
- `npm run tenants:generate`
- `npm test`
