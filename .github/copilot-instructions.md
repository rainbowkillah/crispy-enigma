# Project Guidelines

## Code Style
- Use TypeScript for Cloudflare Workers runtime; align with the monorepo intent in [../docs/plan.md](../docs/plan.md) and [../docs/agents.prompt.yaml](../docs/agents.prompt.yaml).
- Prefer explicit, tenant-scoped APIs (e.g., require `tenantId` in adapter methods) and avoid abstractions that hide tenant boundaries.

## Architecture
- Request flow: `apps/worker-api` -> resolve tenant -> policy (rate limits/CORS/flags) -> AI Gateway -> Workers AI -> DO/KV/Vectorize -> streaming response.
- Core packages are planned as `packages/core`, `packages/storage`, `packages/ai`, `packages/rag`, and `packages/observability` with optional `apps/ingest-worker`.

## Build and Test
- No build/test commands are defined yet (no package.json in repo). Do not guess; update this section once scripts exist.

## Project Conventions
- Tenant resolution is mandatory before any storage or AI access; reject requests without a tenant.
- Enforce tenant scoping on KV keys, DO IDs, and Vectorize indexes; if shared, require metadata filtering by `tenantId`.
- All model calls route through the AI Gateway wrapper (no direct Workers AI calls).

## Integration Points
- Cloudflare services: Workers AI, AI Gateway, Vectorize, KV, Durable Objects (per [../docs/plan.md](../docs/plan.md)).
- Tenant configuration is expected under `tenants/<tenant>/` with `tenant.config.json` and `wrangler.jsonc`.

## Security
- No secrets in the repo; use wrangler secrets/vars only.
- Default to strict input validation, tenant-scoped CORS, and rate limiting; avoid PII logging and redact sensitive tokens.
