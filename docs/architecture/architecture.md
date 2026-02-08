# Architecture

This document describes the system architecture of the multi-tenant Cloudflare Workers AI platform. It covers the monorepo layout, Cloudflare primitives in use, the request lifecycle, package responsibilities, configuration strategy, and planned extension points.

## Monorepo layout

```
crispy-enigma/
├── apps/
│   └── worker-api/          # HTTP entry point — the Worker that handles all requests
├── packages/
│   ├── core/                # Tenant resolution, Env types, response envelope, Zod schemas
│   ├── storage/             # Tenant-scoped adapters for KV, Vectorize, Durable Objects
│   ├── ai/                  # AI Gateway wrapper (placeholder — M2)
│   ├── rag/                 # Chunking, retrieval, prompt assembly (placeholder — M3)
│   └── observability/       # Structured logs, metrics helpers (placeholder — M7)
├── tenants/                 # Per-tenant config + wrangler files
│   ├── <tenant>/tenant.config.json
│   ├── <tenant>/wrangler.jsonc
│   └── index.ts             # Auto-generated barrel of all tenant configs
├── tests/                   # Unit + integration tests (Vitest)
├── scripts/                 # Dev tooling (dev server, smoke tests, tenant index generator)
└── docs/                    # Architecture docs, footguns, milestones, examples
```

Nx manages task orchestration. Each directory under `apps/` and `packages/` has a `project.json` exposing `test`, `typecheck`, and (for apps) `dev` targets. All targets delegate to standard tooling (Vitest, tsc, wrangler).

## Cloudflare primitives

The platform is built entirely on Cloudflare's edge infrastructure. Every primitive is accessed through Worker bindings defined at deploy time in `wrangler.jsonc`.

### Workers AI

Text generation and embedding inference. All calls are routed through AI Gateway (see below) using the `env.AI` binding — never via raw `fetch()`. Model selection is tenant-configurable.

Current models:
- Chat: `@cf/meta/llama-3.1-8b-instruct` (or `-fast` variant)
- Embeddings: `@cf/baai/bge-m3` (1024 dimensions)

### AI Gateway

Policy enforcement, cost attribution, and observability layer for all AI calls. Accessed via the `gateway` parameter on `env.AI.run()`:

```ts
env.AI.run(model, inputs, {
  gateway: { id: tenant.aiGatewayId, metadata: { tenantId } }
});
```

Gateway metadata is limited to 5 entries with string/number/boolean values. The `tenantId` metadata field provides per-tenant attribution in gateway analytics.

Budget tracking is enforced in the Worker using per-tenant token budgets. Usage counters are stored in KV (daily/monthly), and requests can be rejected when limits are exceeded. Usage metrics (latency, tokens in/out) are captured from AI Gateway responses when available, with lightweight estimates when not.

### Vectorize

Vector database for RAG retrieval. A single shared index is used across all tenants, with isolation provided by the `namespace` parameter (applied before vector search, up to 50K namespaces on paid plan). The binding type is `Vectorize` (V2 API).

Limits: top-K is 20 with metadata, 100 without. Metadata capped at 10 KiB per vector.

### KV

Three KV namespaces shared across tenants:

| Binding | Purpose |
|---------|---------|
| `CONFIG` | Feature flags, tenant allow-lists, non-sensitive configuration |
| `CACHE` | Response caching for repeated queries |
| `RATE_LIMITER` | Rate-limiting state (sliding window counters) |

Tenant isolation is enforced by key prefixing: all keys are formatted as `{tenantId}:{key}`. KV has ~60s eventual consistency for propagation.

### Durable Objects

Two DO classes, each with a dedicated binding:

| Binding | Class | Purpose |
|---------|-------|---------|
| `CHAT_SESSION` | `ChatSession` | Stateful chat session history per tenant+session |
| `RATE_LIMITER_DO` | `RateLimiter` | Sliding-window rate limiting per tenant+user |

DO IDs encode the tenant: `namespace.idFromName(`${tenantId}:${objectId}`)`. Session and rate-limiter DOs use separate namespaces to prevent contention.

### D1

SQL database for structured metadata (chat session metadata, audit records, token counts). Raw prompts are never stored in D1. Each tenant's wrangler config references a tenant-specific D1 database.

## Request lifecycle

Every request to the Worker follows this sequence:

```
HTTP Request
     │
     ▼
┌─────────────────────────┐
│  1. Tenant Resolution   │  ← resolveTenant(request, { hostMap, apiKeyMap })
│     header → host → key │     Returns ResolvedTenant | null
└────────────┬────────────┘
             │ null → 400 "Tenant required"
             ▼
┌─────────────────────────┐
│  2. Config Lookup       │  ← tenantIndex.byId[tenantId]
│                         │     Returns TenantConfig | undefined
└────────────┬────────────┘
             │ undefined → 404 "Unknown tenant"
             ▼
┌─────────────────────────┐
│  3. Request Validation  │  ← Body size check (MAX_REQUEST_BODY_SIZE)
│                         │     Content-Length or buffered body
└────────────┬────────────┘
             │ oversized → 413 "Payload too large"
             ▼
┌─────────────────────────┐
│  4. Route Dispatch      │  ← URL pathname matching
│     /health             │     /chat, /chat/:sessionId/history, /chat/:sessionId
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│  5. Response Envelope   │  ← ok(data, traceId) or fail(code, msg, status, traceId)
│     { ok, data|error }  │
└─────────────────────────┘
```

Tenant resolution is mandatory — no request proceeds without it. The trace ID (`cf-ray` or `x-request-id`) is attached to every response for correlation.

## Package responsibilities

### packages/core

The foundation package. All other packages and the Worker app depend on it.

**Env interface** ([env.ts](packages/core/src/env.ts)) — single source of truth for all Worker bindings and environment variables. Bindings are deploy-time constants; environment variables are configurable per tenant and environment.

```ts
export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  CONFIG: KVNamespace;
  CACHE: KVNamespace;
  RATE_LIMITER: KVNamespace;
  DB: D1Database;
  CHAT_SESSION: DurableObjectNamespace;
  RATE_LIMITER_DO: DurableObjectNamespace;
  ENVIRONMENT?: string;
  MODEL_ID?: string;
  FALLBACK_MODEL_ID?: string;
  // ... additional env vars
}
```

**Tenant resolution** ([resolveTenant.ts](packages/core/src/tenant/resolveTenant.ts)) — priority-ordered lookup:
1. `x-tenant-id` header (direct)
2. URL hostname matched against `hostMap`
3. `x-api-key` header matched against `apiKeyMap`

Returns `{ tenantId, source }` or `null`.

**Tenant config schema** ([schema.ts](packages/core/src/tenant/schema.ts)) — Zod schema validating `tenant.config.json` at load time. Required fields: `tenantId`, `accountId`, `aiGatewayId`, `aiModels`, `vectorizeNamespace`, `rateLimit`. Optional: `sessionRetentionDays` (default 30), `maxMessagesPerSession` (default 1000), `featureFlags`, `allowedHosts`, `apiKeys`.

**Tenant index** ([loader.ts](packages/core/src/tenant/loader.ts)) — `buildTenantIndex(configs)` pre-computes three O(1) lookup maps from validated configs: `hostMap`, `apiKeyMap`, `byId`.

**Response envelope** ([response.ts](packages/core/src/http/response.ts)) — consistent JSON envelope for all responses:
- `ok(data, traceId?)` → `{ ok: true, data, traceId }`
- `fail(code, message, status?, traceId?)` → `{ ok: false, error: { code, message }, traceId }`

### packages/storage

Tenant-scoped adapters that wrap raw Cloudflare bindings. Every method requires `tenantId` as an explicit parameter.

- **TenantKVAdapter** — prefixes all keys with `{tenantId}:` within a shared KV namespace.
- **TenantVectorizeAdapter** — injects `namespace: tenantId` into all Vectorize queries and upserts.
- **getTenantDurableObject** — encodes `{tenantId}:{objectId}` into DO ID via `idFromName()`.

### packages/ai (placeholder)

Will contain the AI Gateway wrapper (`generateChat`, `generateEmbedding`) that enforces gateway routing for all Workers AI calls. Implementation in M2.

### packages/rag (placeholder)

Will contain the RAG pipeline: chunking, embedding generation, Vectorize retrieval, prompt assembly, and citation formatting. Implementation in M3.

### packages/observability (placeholder)

Will contain structured logging schemas, metrics helpers, and correlation ID propagation. Implementation in M7.

### apps/worker-api

The deployed Worker. Responsibilities:
1. Load and validate all tenant configs at module scope (startup).
2. Build the tenant index (pre-computed lookup maps).
3. Handle every incoming request through the tenant resolution → routing → response pipeline.

Endpoints implemented through M1:
- `/health` — tenant-aware health check (M0)
- `POST /chat` — streaming chat with SSE, session persistence, rate limiting (M1)
- `GET /chat/:sessionId/history` — session history retrieval (M1)
- `DELETE /chat/:sessionId` — session clear (M1)

Planned endpoints (M2+):
- `/search` — RAG-powered search with citations
- `/tools/execute` — tool/function dispatch
- `/ingest` — document ingestion pipeline
- `/tts` — text-to-speech adapter

## Tenant configuration

Each tenant has two files under `tenants/<name>/`:

**tenant.config.json** — runtime configuration consumed by the Worker:
```json
{
  "tenantId": "tenant-id",
  "accountId": "account-id",
  "aiGatewayId": "gateway-id",
  "aiModels": { "chat": "@cf/meta/llama-3.1-8b-instruct", "embeddings": "@cf/baai/bge-m3" },
  "vectorizeNamespace": "tenant-namespace",
  "rateLimit": { "perMinute": 60, "burst": 20 },
  "featureFlags": {},
  "allowedHosts": ["tenant.local"],
  "apiKeys": []
}
```

**wrangler.jsonc** — deploy-time binding configuration:
- Account ID, worker name, compatibility date
- AI, KV, D1, DO, Vectorize bindings with concrete IDs
- Environment-specific variable overrides (dev/staging/production)
- DO migration tags

The `scripts/generate-tenant-index.mjs` script scans `tenants/` and generates `tenants/index.ts`, which barrel-exports all configs for import by the Worker.

## Env types vs. tenant config

A key architectural distinction:

- **`Env`** (deploy-time) — Cloudflare bindings injected by the runtime. Fixed per deployment. Cannot be dynamically selected.
- **`TenantConfig`** (runtime) — per-tenant settings loaded from JSON. Used to parameterize operations within shared bindings.

`TenantConfig` does NOT contain binding names. Bindings are shared across tenants and fixed in `Env`. Tenant isolation is achieved through key prefixing, namespace parameters, and ID encoding within those shared bindings.

## TypeScript configuration

- Target: ES2022 (Cloudflare Workers runtime)
- Module: ESNext with Bundler resolution
- Types: `@cloudflare/workers-types` for `Ai`, `Vectorize`, `KVNamespace`, `DurableObjectNamespace`, etc.
- Strict mode enabled; `verbatimModuleSyntax` enforced
- Module format: ESM (`"type": "module"` in package.json; `export default { fetch }` handler)

## Wrangler configuration

- Format: `.jsonc` (not `.toml`) for comment support and JSON tooling compatibility
- Version: pinned at `wrangler@4.63.0`
- Compatibility date: `2026-02-01`
- Each tenant has its own `wrangler.jsonc` referencing the shared Worker entry point (`apps/worker-api/src/index.ts`)

## Testing strategy

Vitest runs all tests in the `tests/` directory. Current coverage (M0+M1):

| Test | Focus | Milestone |
|------|-------|-----------|
| [`health.test.ts`](../tests/health.test.ts) | /health endpoint with header, host, and API key tenant resolution | M0 |
| [`resolveTenant.test.ts`](../tests/resolveTenant.test.ts) | Resolution priority order; null for unresolvable requests | M0 |
| [`kv-prefix.test.ts`](../tests/kv-prefix.test.ts) | TenantKVAdapter key prefixing + cache key correctness | M0+M1 |
| [`do-name.test.ts`](../tests/do-name.test.ts) | DO name encoding pattern | M0 |
| [`request-size.test.ts`](../tests/request-size.test.ts) | Request body size validation (413 responses) | M0 |
| [`chat.test.ts`](../tests/chat.test.ts) | /chat endpoint validation, streaming default, history, session clear | M1 |
| [`streaming.test.ts`](../tests/streaming.test.ts) | SSE streaming and JSON fallback behavior | M1 |
| [`session-isolation.test.ts`](../tests/session-isolation.test.ts) | Tenant-scoped DO naming, cross-tenant isolation | M1 |
| [`rate-limit.test.ts`](../tests/rate-limit.test.ts) | 429 rejection and rate limit header generation | M1 |
| [`rate-limiter.test.ts`](../tests/rate-limiter.test.ts) | `applyRateLimit()` allow/deny logic, remaining count | M1 |
| [`session-retention.test.ts`](../tests/session-retention.test.ts) | `pruneMessages()` time-based cleanup, maxMessages cap | M1 |

**32 tests across 11 files** (296ms). Planned (M2+): Vectorize tenant isolation tests, tool permission tests, load/stress tests.

## Planned endpoints

| Endpoint | Milestone | Description |
|----------|-----------|-------------|
| `GET /health` | M0 | Tenant-aware health check |
| `POST /chat` | M1 | Streaming chat with session persistence (SSE) |
| `GET /chat/:sessionId/history` | M1 | Session history retrieval |
| `DELETE /chat/:sessionId` | M1 | Session clear |
| `POST /search` | M4 | RAG search: answer + sources + confidence + follow-ups |
| `POST /tools/execute` | M5 | Tool/function dispatch with permission gating |
| `POST /ingest` | M3 | Document chunking + embedding + Vectorize upsert |
| `POST /tts` | M6 | Text-to-speech adapter (contract + stub) |

## Development workflow

```bash
npm install
npm run tenants:generate          # Generate tenants/index.ts
npm run dev -- --tenant=mrrainbowsmoke   # Start wrangler dev for a tenant
npm run smoke:dev -- --tenant=mrrainbowsmoke  # Health check smoke test
npm test                          # Run all tests
npm run lint                      # ESLint
npm run typecheck                 # TypeScript strict check
```

## Milestone roadmap

| Milestone | Scope | Status |
|-----------|-------|--------|
| M0 | Foundation: monorepo, tenant resolution, Env types, /health, tests | Complete |
| M1 | Chat + Sessions: /chat streaming, DO sessions, KV cache, rate limiter | Complete |
| M2 | AI Gateway: gateway integration, model routing, budget/limits, observability hooks | Complete |
| M3 | Embeddings + Vectorize + RAG: ingestion, retrieval, citations | Complete |
| M4 | AI Search UX: /search endpoint, query rewriting, caching | Complete |
| M5 | Tool Execution: tool registry, dispatcher, permission gating | Complete |
| M6 | TTS Adapter: contract + stub + optional provider | Complete |
| M7 | Observability: logging schema, metrics, CI gates, load tests | Complete |
| M8 | Deployment Automation: per-tenant deploy, drift detection, rollback | Complete (staging validated) |
| NX-1–4 | Nx Plugin: generators for workers, tenants, bindings, deploy executors | Planned |
