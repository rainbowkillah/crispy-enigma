# Quick Reference

## Tenants
- `alpha`
- `example`
- `mrrainbowsmoke`
- `rainbowsmokeofficial`

## Worker Names
- `alpha-worker` (alpha)
- `worker-api-example` (example)
- `bluey-ai-worker` (mrrainbowsmoke)
- `azure-ai-worker` (rainbowsmokeofficial)

## Bindings (shared names)
- Workers AI: `AI`
- KV: `RATE_LIMITER`, `CONFIG`, `CACHE`
- D1: `DB`
- Durable Objects: `RATE_LIMITER_DO`, `CHAT_SESSION`
- Vectorize: `VECTORIZE`

## Tenant Config Paths
- `tenants/alpha/tenant.config.json`
- `tenants/alpha/wrangler.jsonc`
- `tenants/example/tenant.config.json`
- `tenants/example/wrangler.jsonc`
- `tenants/mrrainbowsmoke/tenant.config.json`
- `tenants/mrrainbowsmoke/wrangler.jsonc`
- `tenants/rainbowsmokeofficial/tenant.config.json`
- `tenants/rainbowsmokeofficial/wrangler.jsonc`

## Local Dev
- `npm run tenants:generate`
- `npm run dev -- --tenant=alpha`
- `npm run dev -- --tenant=example`
- `npm run dev -- --tenant=mrrainbowsmoke`
- `npm run dev -- --tenant=rainbowsmokeofficial`

## Miniflare
- Installed as a dev dependency for local emulation (usage TBD per tenant config).
- `npm run dev -- --tenant=mrrainbowsmoke --env=dev`
- `npm run smoke:dev -- --tenant=mrrainbowsmoke`

## Wrangler
- Version pinned: `wrangler@4.63.0` (see `docs/wrangler.md`)

## Test
- `npm run tenants:generate`
- `npm test`
