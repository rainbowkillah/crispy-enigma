# Handoff: M0 Foundation Complete

## Status
M0 scaffolding is in place with tenant resolution, core response helpers, and baseline tooling. The worker exposes `/health` and enforces tenant resolution before responding. Tenant configs are Zod-validated and indexed for host/api-key lookups. Storage adapters are tenant-scoped for KV, DO, and Vectorize.

## What Shipped (Key Files)
- Worker entry: [apps/worker-api/src/index.ts](apps/worker-api/src/index.ts)
- Tenant resolution + loader: [packages/core/src/tenant/resolveTenant.ts](packages/core/src/tenant/resolveTenant.ts), [packages/core/src/tenant/loader.ts](packages/core/src/tenant/loader.ts)
- Tenant config schema: [packages/core/src/tenant/schema.ts](packages/core/src/tenant/schema.ts)
- Response envelope + trace id: [packages/core/src/http/response.ts](packages/core/src/http/response.ts)
- Env typings: [packages/core/src/env.ts](packages/core/src/env.ts)
- Tenant-scoped adapters: [packages/storage/src/kv.ts](packages/storage/src/kv.ts), [packages/storage/src/do.ts](packages/storage/src/do.ts), [packages/storage/src/vectorize.ts](packages/storage/src/vectorize.ts)
- Local dev scripts: [scripts/dev.mjs](scripts/dev.mjs), [scripts/smoke-dev.mjs](scripts/smoke-dev.mjs)
- Tests: [tests/resolveTenant.test.ts](tests/resolveTenant.test.ts), [tests/kv-prefix.test.ts](tests/kv-prefix.test.ts), [tests/do-name.test.ts](tests/do-name.test.ts), [tests/health.test.ts](tests/health.test.ts), [tests/request-size.test.ts](tests/request-size.test.ts)
- Wrangler + module format doc: [docs/wrangler.md](docs/wrangler.md)

## M0 Exit Criteria Checklist
- Tenant resolution required before responding: done in [apps/worker-api/src/index.ts](apps/worker-api/src/index.ts)
- `/health` per tenant: implemented and tested
- Tenant resolution + KV prefixing tests: present
- Env uses Vectorize V2 (`Vectorize`): confirmed in [packages/core/src/env.ts](packages/core/src/env.ts)
- `wrangler.jsonc` + ESM: documented in [docs/wrangler.md](docs/wrangler.md)

## Gaps / Follow-Ups
- Miniflare is not installed (prompt says "if compatible"); decision not documented.
- Tests not re-run in this session (last `pnpm test` failed due to missing pnpm). Validate with `npm install` then `npm test`.
- `docs/bindings.md` lists DO/D1 references that are not implemented yet; treat as future planning for M1+.

## How to Run
- `npm install`
- `npm run tenants:generate`
- `npm run dev -- --tenant=example`
- `npm run smoke:dev -- --tenant=example`

## Next Agent Focus (M1)
- Implement `/chat` streaming endpoint with schema validation.
- Add tenant-scoped DO session state (`CHAT_SESSION`).
- Add KV cache adapter usage (`CACHE`) for metadata.
- Add DO rate limiter (`RATE_LIMITER_DO`) and tests.

## Notes
- Tenant configs are indexed via [scripts/generate-tenant-index.mjs](scripts/generate-tenant-index.mjs). Re-run after adding tenants.
- Tenant resolution order is header -> host -> API key (see [packages/core/src/tenant/resolveTenant.ts](packages/core/src/tenant/resolveTenant.ts)).
