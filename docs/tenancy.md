# Tenancy

This document defines the multi-tenancy model: how tenants are resolved, how isolation is enforced across every Cloudflare primitive, and the rules that all code in this monorepo must follow.

## Tenant boundary definition

A **tenant** is the minimal isolation unit. No data, state, or AI usage crosses tenant boundaries unless explicitly configured as shared. Every storage key, Durable Object ID, Vectorize query, AI Gateway call, and cache entry is tenant-scoped.

All tenants share the same deployed Worker and the same Cloudflare bindings. Isolation is logical, not physical — enforced through key prefixing, namespace parameters, and ID encoding within shared infrastructure.

## TenantContext

The `TenantContext` type ([packages/core/src/tenant/types.ts](packages/core/src/tenant/types.ts)) carries everything needed to operate on behalf of a tenant:

```ts
type TenantContext = {
  tenantId: string;               // Unique tenant identifier
  accountId: string;              // Cloudflare account ID
  aiGatewayId: string;            // AI Gateway ID for this tenant
  aiModels: {
    chat: string;                 // e.g. "@cf/meta/llama-3.1-8b-instruct"
    embeddings: string;           // e.g. "@cf/baai/bge-base-en-v1.5"
  };
  vectorizeNamespace: string;     // Vectorize namespace for isolation
  rateLimit: {
    perMinute: number;            // Requests per minute cap
    burst: number;                // Burst allowance
  };
  featureFlags: Record<string, boolean>;
  allowedHosts: string[];         // Hostnames that resolve to this tenant
  apiKeys: string[];              // API keys that resolve to this tenant
};
```

`TenantContext` does **not** contain binding names. Bindings (`AI`, `VECTORIZE`, `CONFIG`, etc.) are fixed in the `Env` interface at deploy time and shared across all tenants. Tenant-specific behavior is parameterized through the fields above.

## Tenant resolution

Tenant resolution runs before any handler logic. It is mandatory — requests that cannot be resolved to a tenant are rejected with `400 Tenant required`.

### Resolution priority

The resolution function ([packages/core/src/tenant/resolveTenant.ts](packages/core/src/tenant/resolveTenant.ts)) checks three sources in strict priority order:

| Priority | Source | Mechanism |
|----------|--------|-----------|
| 1 (highest) | `x-tenant-id` header | Direct tenant ID lookup |
| 2 | URL hostname | Matched against pre-computed `hostMap` |
| 3 (lowest) | `x-api-key` header | Matched against pre-computed `apiKeyMap` |

The first match wins. If none match, the function returns `null` and the Worker returns a 400 error.

### Resolution result

```ts
type ResolvedTenant = {
  tenantId: string;
  source: 'header' | 'host' | 'apiKey';
};
```

The `source` field records how the tenant was resolved, which is useful for debugging and audit logging.

### Tenant index

At Worker startup, all `tenant.config.json` files are loaded and validated via Zod ([packages/core/src/tenant/schema.ts](packages/core/src/tenant/schema.ts)). The `buildTenantIndex()` function ([packages/core/src/tenant/loader.ts](packages/core/src/tenant/loader.ts)) pre-computes three O(1) lookup maps:

- `hostMap: Record<hostname, tenantId>` — from `allowedHosts` arrays
- `apiKeyMap: Record<apiKey, tenantId>` — from `apiKeys` arrays
- `byId: Record<tenantId, TenantConfig>` — direct config lookup

This happens once at module scope, not per-request.

## Isolation by primitive

### KV — key prefixing

All KV operations go through `TenantKVAdapter` ([packages/storage/src/kv.ts](packages/storage/src/kv.ts)), which prefixes every key with `{tenantId}:`.

```ts
// Internal key format: "tenant-a:sessions:abc123"
const tenantKey = (tenantId: string, key: string) => `${tenantId}:${key}`;
```

Three KV namespaces are shared across tenants:

| Binding | Isolation key pattern | Example |
|---------|-----------------------|---------|
| `CONFIG` | `{tenantId}:{configKey}` | `alpha:feature-flags` |
| `CACHE` | `{tenantId}:{cacheKey}` | `example:search:hash123` |
| `RATE_LIMITER` | `{tenantId}:{rateLimitKey}` | `alpha:ip:192.168.1.1` |

Raw `env.CONFIG.get()`, `env.CACHE.get()`, or `env.RATE_LIMITER.get()` must never be called outside the adapter. The adapter enforces the prefix.

### Vectorize — namespace isolation

All Vectorize operations go through `TenantVectorizeAdapter` ([packages/storage/src/vectorize.ts](packages/storage/src/vectorize.ts)), which injects `namespace: tenantId` into every query and upsert.

```ts
// Query: scoped to tenant's namespace within the shared index
this.index.query(vector, { ...options, namespace: tenantId });

// Upsert: each vector tagged with tenant's namespace
this.index.upsert(vectors.map(v => ({ ...v, namespace: tenantId })));
```

Namespace filtering is applied **before** vector search, providing both performance and isolation benefits. The shared index supports up to 50K namespaces on the paid plan.

**Fallback option:** metadata filtering (`filter: { tenantId }`) is supported but less performant since it applies after search. The namespace approach is preferred.

**Limits to account for:**
- Top-K: 20 with metadata, 100 without
- Metadata: 10 KiB per vector
- Filter JSON: < 2048 bytes compact

### Durable Objects — ID encoding

All DO access goes through `getTenantDurableObject()` ([packages/storage/src/do.ts](packages/storage/src/do.ts)), which encodes the tenant in the DO ID:

```ts
const name = `${tenantId}:${objectId}`;       // e.g. "alpha:session-42"
const id = namespace.idFromName(name);
const stub = namespace.get(id);
```

Two DO bindings are used, each for a different purpose:

| Binding | Class | Key pattern | Purpose |
|---------|-------|-------------|---------|
| `CHAT_SESSION` | `ChatSession` | `{tenantId}:{sessionId}` | Chat session state |
| `RATE_LIMITER_DO` | `RateLimiter` | `{tenantId}:ratelimit:{userKey}` | Per-tenant rate limiting |

These use separate bindings to prevent contention between session and rate-limiting workloads on the same DO instance.

### D1 — per-tenant databases

Each tenant's `wrangler.jsonc` references a tenant-specific D1 database ID. The `DB` binding resolves to a different physical database per deployment. D1 stores metadata only (roles, timestamps, token counts) — never raw prompts.

### Workers AI — gateway attribution

All AI calls must use the `gateway` parameter on `env.AI.run()`, which routes through AI Gateway for observability and policy enforcement:

```ts
env.AI.run(model, inputs, {
  gateway: {
    id: tenant.aiGatewayId,
    metadata: { tenantId }
  }
});
```

The `metadata.tenantId` field provides per-tenant cost attribution and usage tracking in AI Gateway analytics. Gateway metadata is limited to 5 entries with string/number/boolean values only.

Direct `env.AI.run()` calls without the `gateway` parameter are prohibited — they bypass observability and cost attribution.

## Enforcement rules

These rules apply to all code in the monorepo. They are the contract that makes multi-tenancy safe.

### 1. Tenant resolution is mandatory

Every request must be resolved to a tenant before any storage, AI, or business logic executes. Unresolved requests are rejected immediately.

```ts
const tenant = resolveTenant(request, { hostMap, apiKeyMap });
if (!tenant) return fail('tenant_required', 'Tenant required', 400, traceId);
```

### 2. Explicit tenantId in all method signatures

Every function that touches storage, AI, or shared state must accept `tenantId: string` as an explicit parameter. Tenant context must never be hidden in closures, class constructors, or module-level state.

```ts
// Correct — tenant visible at call site
async get(tenantId: string, key: string): Promise<string | null>

// Wrong — tenant hidden in closure
const adapter = createAdapter(tenantId);
adapter.get(key); // Where's the tenant?
```

### 3. No raw binding access outside adapters

Direct access to `env.CONFIG`, `env.CACHE`, `env.RATE_LIMITER`, `env.VECTORIZE`, `env.CHAT_SESSION`, or `env.RATE_LIMITER_DO` is only permitted inside the corresponding adapter in `packages/storage`. Application code must use the adapter.

### 4. All AI calls route through gateway

`env.AI.run()` must always include the `gateway` parameter with the tenant's gateway ID and metadata. The planned wrapper in `packages/ai` will enforce this.

### 5. DO IDs must encode tenant

Every `idFromName()` call must use the pattern `${tenantId}:${objectId}`. The `getTenantDurableObject()` helper enforces this.

### 6. Vectorize queries must scope by tenant

Every Vectorize query and upsert must pass `namespace: tenantId`. The `TenantVectorizeAdapter` enforces this.

### 7. Cache keys must include tenant

All KV cache keys must be prefixed with `{tenantId}:`. The `TenantKVAdapter` enforces this for `CONFIG`, `CACHE`, and `RATE_LIMITER` namespaces.

### 8. Rate limiting must be per-tenant

Rate limit counters must include `tenantId` in the key. One tenant hitting their limit must not affect another tenant. The rate limiter uses a dedicated `RATE_LIMITER_DO` binding, separate from `CHAT_SESSION`.

## Tenant configuration files

Each tenant is defined by two files in `tenants/<name>/`:

### tenant.config.json

Runtime configuration consumed by the Worker. Validated at startup via Zod.

```json
{
  "tenantId": "alpha",
  "accountId": "alpha-account",
  "aiGatewayId": "alpha-gateway",
  "aiModels": {
    "chat": "@cf/meta/llama-3.1-8b-instruct",
    "embeddings": "@cf/baai/bge-base-en-v1.5"
  },
  "vectorizeNamespace": "alpha",
  "rateLimit": { "perMinute": 60, "burst": 20 },
  "featureFlags": {},
  "allowedHosts": ["alpha.local"],
  "apiKeys": ["alpha-key"]
}
```

### wrangler.jsonc

Deploy-time Cloudflare binding configuration. Includes concrete KV namespace IDs, D1 database IDs, DO class references, environment variable overrides, and account ID.

Each tenant's wrangler file references the same Worker entry point (`apps/worker-api/src/index.ts`) but may have different binding IDs, worker names, and environment settings.

## Current tenants

| Tenant | Worker name | Account | Hosts | API Keys |
|--------|-------------|---------|-------|----------|
| `alpha` | `alpha-worker` | `alpha-account` | `alpha.local` | `alpha-key` |
| `example` | `worker-api-example` | `example-account` | `example.local` | (none) |
| `mrrainbowsmoke` | `bluey-ai-worker` | `9acbaee...` | `mrrainbowsmoke.local` | (none) |
| `rainbowsmokeofficial` | `azure-ai-worker` | `7fde695...` | `rainbowsmokeofficial.local` | (none) |

New tenants are added by creating a `tenants/<name>/` directory with both config files, then running `npm run tenants:generate` to regenerate the barrel export.

## Adding a new tenant

1. Create `tenants/<name>/tenant.config.json` with all required fields.
2. Create `tenants/<name>/wrangler.jsonc` with binding IDs for the target Cloudflare account.
3. Run `npm run tenants:generate` to regenerate `tenants/index.ts`.
4. Run `npm test` to verify the new config passes Zod validation.
5. Deploy with `wrangler deploy --config tenants/<name>/wrangler.jsonc`.

## Testing tenant isolation

Every isolation mechanism has corresponding tests:

| Test | Verifies |
|------|----------|
| `resolveTenant.test.ts` | Resolution priority (header > host > apiKey); null for unresolvable |
| `health.test.ts` | Tenant-aware /health responses; rejection of missing tenant |
| `kv-prefix.test.ts` | KV adapter prefixes keys with tenantId |
| `do-name.test.ts` | DO name encoding includes tenantId |
| `request-size.test.ts` | Body size validation per tenant config |

Planned tests (M1+) will verify cross-tenant session isolation, rate-limit independence, and Vectorize namespace boundary enforcement.

## Anti-patterns

Common mistakes that break tenant isolation are cataloged in [footguns.md](footguns.md), including:

1. Forgetting tenant resolution (direct binding access)
2. KV keys without tenant prefix
3. DO IDs without tenant encoding
4. Vectorize queries without namespace/filter
5. Direct AI calls bypassing gateway
6. Cache keys without tenant scope
7. Hidden tenant context in closures
8. Global rate limiting (not per-tenant)

Each anti-pattern includes wrong/right code examples, mitigation strategies, and test patterns. See [footguns.md](footguns.md) for the full catalog.

## Shared vs. per-tenant deployment

The current architecture uses **shared bindings** — all tenants share the same `AI`, `VECTORIZE`, `CONFIG`, `CACHE`, `RATE_LIMITER`, `DB`, `CHAT_SESSION`, and `RATE_LIMITER_DO` binding names. Isolation is logical.

An alternative model is **per-tenant deployments** with dedicated bindings (separate KV namespaces, separate Vectorize indexes per tenant). This provides stronger physical isolation but increases deployment complexity and Cloudflare account resource usage. The shared model is preferred unless regulatory or compliance requirements demand physical separation.

The architecture supports both models. Per-tenant `wrangler.jsonc` files already allow different binding IDs per tenant — switching to dedicated resources requires only changing the IDs, not the application code.
