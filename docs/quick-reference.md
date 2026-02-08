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
- Vectorize: `VECTORIZE`

## Endpoints
- `POST /chat`
- `GET /chat/:sessionId/history`
- `DELETE /chat/:sessionId`

## M1 Docs
- `docs/streaming.md`
- `docs/sessions.md`
- `docs/rate-limiting.md`

## Tenant Config Paths
- `tenants/mrrainbowsmoke/tenant.config.json`
- `tenants/mrrainbowsmoke/wrangler.jsonc`
- `tenants/rainbowsmokeofficial/tenant.config.json`
- `tenants/rainbowsmokeofficial/wrangler.jsonc`

## Local Dev
- `npm run tenants:generate`
- `npm run dev -- --tenant=mrrainbowsmoke`
- `npm run dev -- --tenant=rainbowsmokeofficial`

## Miniflare
- Installed as a dev dependency for local emulation (usage TBD per tenant config).
- `npm run dev -- --tenant=mrrainbowsmoke --env=dev`
- `npm run smoke:dev -- --tenant=mrrainbowsmoke`

## Wrangler
- Version pinned: `wrangler@4.63.0` (see `docs/wrangler.md`)

## Environment Tags
- Development: `dev`, `develop`, `development`
- Staging: `stg`, `staging`, `preview`
- Production: `prd`, `prod`, `production`

## Test
- `npm run tenants:generate`
- `npm test`
