# Handoff: M2 AI Gateway Integration (In Progress)

## Status
M2 is in progress. Issues #26–#31 are complete. Issue #25 (Gateway integration spike) is partially validated via dev smoke tests; full staging validation remains.

## What Shipped (Key Files)
- AI Gateway wrapper + usage metrics: `packages/ai/src/gateway.ts`
- Chat handler updates (model overrides, budgets, usage headers): `apps/worker-api/src/index.ts`
- Chat request schema (`modelId`): `packages/core/src/chat/schema.ts`
- Tenant config schema + types (token budgets, allow-list): `packages/core/src/tenant/schema.ts`, `packages/core/src/tenant/types.ts`
- Token budget tests: `tests/token-budget.test.ts`
- Model override tests: `tests/ai-gateway.test.ts`
- AI Gateway docs: `docs/ai-gateway.md`, `docs/ai-gateway-fallbacks.md`
- Streaming contract updates: `docs/streaming.md`
- ADR: `docs/adrs/ADR-004-model-selection-precedence.md`
- Wrangler dev remote binding updates:
  - `tenants/mrrainbowsmoke/wrangler.jsonc`
  - `tenants/rainbowsmokeofficial/wrangler.jsonc`
- Changelog: `CHANGELOG.md`

## Dev Smoke Tests (2026-02-07)

### mrrainbowsmoke (remote bindings, dev)
- `GET /health` ✅ OK
- `POST /chat` `stream:false` → `ai_error` (502)
- `POST /chat` `stream:true` → SSE `event: error` then `event: done` with usage payload

### rainbowsmokeofficial
- Remote proxy failed (`/workers/subdomain/edge-preview` API error).
- Local dev (`--local`) started; `GET /health` ✅ OK
- `/chat` `stream:false` and `stream:true` → `ai_error` (AI binding not supported locally)

## Commands Run
- `npm run lint` ✅
- `npm run typecheck` ✅

## Open Work (M2 #25)
- Run staging spike with real AI Gateway (remote dev + dashboard verification).
- Confirm gateway logs include metadata (`tenantId`, `traceId`, `sessionId`, `route`).
- Validate streaming behavior (TTFB + token delivery) against real gateway responses.
- Document spike results.

## Notes
- Remote bindings are now configured in `wrangler.jsonc` (no `--remote` needed).
- AI Gateway auth tokens remain in tenant `.env` only; Worker uses `env.AI` binding.
