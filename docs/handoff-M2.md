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

Preview domain format (dev):
`<worker-name>-<env>.<tenant>.workers.dev`  
Example: `bluey-ai-worker-dev.mrrainbowsmoke.workers.dev`

### rainbowsmokeofficial
- Remote proxy failed (`/workers/subdomain/edge-preview` API error).
- Local dev (`--local`) started; `GET /health` ✅ OK
- `/chat` `stream:false` and `stream:true` → `ai_error` (AI binding not supported locally)

## Exact Commands + Outputs

### mrrainbowsmoke (remote bindings, dev)

Start:
```bash
npx wrangler dev --config tenants/mrrainbowsmoke/wrangler.jsonc --env dev --port 8787 --ip 127.0.0.1
```

Health:
```bash
curl -s http://127.0.0.1:8787/health -H 'x-tenant-id: mrrainbowsmoke'
```
```json
{"ok":true,"data":{"status":"ok","tenantId":"mrrainbowsmoke","environment":"dev","modelId":"@cf/meta/llama-3.1-8b-instruct-fast","fallbackModelId":"@cf/meta/llama-3.1-8b-instruct"}}
```

Chat (non-stream):
```bash
curl -s http://127.0.0.1:8787/chat -H 'content-type: application/json' -H 'x-tenant-id: mrrainbowsmoke' -d '{"sessionId":"11111111-1111-1111-1111-111111111111","message":"hello","stream":false}'
```
```json
{"ok":false,"error":{"code":"ai_error","message":"AI provider unavailable"}}
```

Chat (stream):
```bash
timeout 5 curl -sN http://127.0.0.1:8787/chat -H 'content-type: application/json' -H 'x-tenant-id: mrrainbowsmoke' -d '{"sessionId":"11111111-1111-1111-1111-111111111111","message":"hello","stream":true}'
```
```
event: error
data: {"code":"ai_error","message":"AI provider unavailable"}

event: done
data: {"done":true,"usage":{"modelId":"@cf/meta/llama-3.1-8b-instruct","tokensIn":4,"latencyMs":174}}
```

### rainbowsmokeofficial (local dev)

Start:
```bash
npx wrangler dev --config tenants/rainbowsmokeofficial/wrangler.jsonc --env dev --local --port 8788 --ip 127.0.0.1
```

Health:
```bash
curl -s http://127.0.0.1:8788/health -H 'x-tenant-id: rainbowsmokeofficial'
```
```json
{"ok":true,"data":{"status":"ok","tenantId":"rainbowsmokeofficial","environment":"dev","modelId":"@cf/meta/llama-3.1-8b-instruct-fast","fallbackModelId":"@cf/meta/llama-3.1-8b-instruct"}}
```

Chat (non-stream):
```bash
curl -s http://127.0.0.1:8788/chat -H 'content-type: application/json' -H 'x-tenant-id: rainbowsmokeofficial' -d '{"sessionId":"11111111-1111-1111-1111-111111111111","message":"hello","stream":false}'
```
```json
{"ok":false,"error":{"code":"ai_error","message":"AI provider unavailable"}}
```

Chat (stream):
```bash
timeout 5 curl -sN http://127.0.0.1:8788/chat -H 'content-type: application/json' -H 'x-tenant-id: rainbowsmokeofficial' -d '{"sessionId":"11111111-1111-1111-1111-111111111111","message":"hello","stream":true}'
```
```
event: error
data: {"code":"ai_error","message":"AI provider unavailable"}

event: done
data: {"done":true,"usage":{"modelId":"@cf/meta/llama-3.1-8b-instruct","tokensIn":4,"latencyMs":0}}
```

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
