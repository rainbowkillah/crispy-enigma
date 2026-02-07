# Architecture

This document provides a deep dive into the system architecture of the Crispy Enigma multi-tenant AI platform.

## Overview

Crispy Enigma is built entirely on **Cloudflare's edge infrastructure**, leveraging Workers, Durable Objects, KV, Vectorize, and Workers AI. The architecture enforces strict tenant isolation at every layer while maintaining high performance and scalability.

## Core Principles

### 1. Tenant-First Design

**Every operation requires a tenant context.** No storage access, AI call, or business logic executes without first resolving and validating the tenant.

```typescript
// ✅ CORRECT: Explicit tenant parameter
function getSessionDO(tenantId: string, sessionId: string, env: Env): DurableObjectStub {
  const id = env.CHAT_SESSION.idFromName(`${tenantId}:${sessionId}`);
  return env.CHAT_SESSION.get(id);
}

// ❌ WRONG: Hidden tenant in closure
function createAdapter(tenantId: string) {
  return {
    getSession: (sessionId: string) => { /* tenantId from closure */ }
  };
}
```

### 2. Fail-Closed Security

If tenant resolution fails, the request is **rejected with 400 Bad Request**. There are no fallback defaults, no "guest" tenants, no shared context.

### 3. Gateway-First AI

All AI model calls (chat, embeddings) **must** route through AI Gateway. Direct calls to Workers AI are forbidden. This enables:
- Per-tenant cost attribution
- Budget enforcement
- Observability and logging
- Conditional routing

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       HTTP Request                               │
│                   (header, host, API key)                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  1. TENANT RESOLUTION                            │
│  resolveTenant(request, { hostMap, apiKeyMap })                 │
│  • x-tenant-id header (highest priority)                        │
│  • Host mapping (subdomain → tenant)                            │
│  • API key mapping (key → tenant)                               │
│  ────────────────────────────────────────────────────────       │
│  Output: TenantContext | null                                   │
│  If null → 400 "Tenant required"                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  2. CONFIG LOOKUP                                │
│  tenantIndex.byId[tenantId]                                     │
│  Loads: aiModels, rateLimit, vectorizeNamespace, etc.          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  3. POLICY ENFORCEMENT                           │
│  • Rate limiting (DO-based)                                     │
│  • Feature flags (KV)                                           │
│  • CORS (per-tenant config)                                     │
│  • Budget checks (future: M2)                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  4. ROUTE HANDLER                                │
│  POST /chat       → Streaming chat with session history         │
│  GET  /chat/:id/history → Retrieve session history              │
│  DELETE /chat/:id → Clear session                               │
│  POST /search     → RAG search (M3-M4)                          │
│  POST /tools/exec → Tool execution (M5)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ AI GATEWAY  │   │  STORAGE    │   │   CACHE     │
│ (M2)        │   │  ADAPTERS   │   │   LAYER     │
│             │   │             │   │             │
│ Model calls │   │ DO/KV/Vec   │   │ KV (TTL)    │
│ w/ metadata │   │ Tenant-scope│   │ Tenant keys │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              CLOUDFLARE PRIMITIVES                               │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Workers AI  │  │  Vectorize   │  │ Durable Objs │         │
│  │  + Gateway   │  │ (embeddings) │  │   (state)    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │      KV      │  │      D1      │                            │
│  │ (config/cache│  │  (metadata)  │                            │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Package Boundaries

The monorepo is organized into focused packages with clear responsibilities:

### `packages/core`

**Tenant types, resolution middleware, and errors.**

**Key exports:**
- `TenantContext` — Tenant configuration type
- `resolveTenant()` — Tenant resolution middleware
- `Env` — Cloudflare bindings type (single source of truth)
- Response helpers: `ok()`, `fail()`, `createRequestId()`
- Zod schemas for validation

**Patterns:**
```typescript
export interface TenantContext {
  tenantId: string;
  accountId: string;
  aiGatewayId: string;
  aiModels: {
    chat: string;
    embeddings: string;
  };
  vectorizeNamespace: string;
  rateLimit: { perMinute: number; burst: number };
  sessionRetentionDays?: number;
  maxMessagesPerSession?: number;
}
```

### `packages/storage`

**Tenant-scoped adapters for KV, Durable Objects, and Vectorize.**

**Critical Rule:** All methods **must** require `tenantId: string` as the first parameter.

**Key exports:**
- `getKV(tenantId, key, env)` — KV get with tenant prefix
- `putKV(tenantId, key, value, env)` — KV put with tenant prefix
- `getCache(tenantId, key, env)` — KV cache with TTL
- `putCache(tenantId, key, value, ttl, env)` — Cache write

**Patterns:**
```typescript
// KV keys: Always prefix with tenant
const key = `${tenantId}:feature-flags:${flagName}`;

// DO IDs: Encode tenant in ID
const doId = env.CHAT_SESSION.idFromName(`${tenantId}:${sessionId}`);

// Vectorize: Use namespace parameter
const results = await env.VECTORIZE.query(vector, { 
  namespace: tenantId  // Preferred isolation method
});
```

### `packages/ai`

**AI Gateway wrapper — enforces gateway routing for all model calls.**

**Critical Rule:** ALL Workers AI calls MUST use `env.AI.run()` with `gateway` parameter.

**Key exports:**
- `generateChat(tenantId, messages, options, env)` — Chat completion via gateway
- `generateEmbedding(tenantId, texts, env)` — Embeddings via gateway
- `aiStreamToTokenStream()` — SSE stream parser

**Patterns:**
```typescript
// ✅ Correct: Gateway wrapper
import { generateChat } from '@repo/ai/gateway';
const response = await generateChat(tenantId, messages, { model: tenant.aiModels.chat }, env);

// ❌ Wrong: Direct Workers AI call
const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', { messages });
```

### `packages/rag`

**Chunking, retrieval, and prompt assembly for RAG workflows (M3).**

**Key exports (planned):**
- `chunkDocument()` — Text chunking strategy
- `retrieveContext()` — Vectorize query + reranking
- `assemblePrompt()` — RAG prompt with citations

### `packages/observability`

**Structured logging and metrics helpers (M7).**

**Key exports (planned):**
- `logger.info()` — Structured logs with tenant field
- `recordMetric()` — Metrics emission
- `createTraceContext()` — Request tracing

## Cloudflare Primitives

### Workers AI

Text generation and embeddings. Accessed via the `AI` binding.

**Current models:**
- **Chat:** `@cf/meta/llama-3.1-8b-instruct` (or `-fast` variant)
- **Embeddings:** `@cf/baai/bge-base-en-v1.5` (768 dimensions)

**Gateway routing:**
```typescript
env.AI.run(model, inputs, {
  gateway: { 
    id: tenant.aiGatewayId, 
    metadata: { tenantId } 
  }
});
```

### AI Gateway

Policy enforcement, cost attribution, and observability.

**Metadata rules:**
- Max 5 key-value pairs
- String/number/boolean values only
- Use `tenantId` for attribution

**Benefits:**
- Per-tenant usage tracking
- Budget limits enforcement
- Conditional routing (Dynamic Routing Beta)
- Latency and token metrics

### Vectorize

Vector database for RAG retrieval.

**Isolation strategy:**
- **Preferred:** Use `namespace: tenantId` parameter (up to 50K namespaces)
- **Fallback:** Metadata filter `{ tenantId: { $eq: tenantId } }`

**Limits:**
- Top-K: 20 with metadata, 100 without metadata
- Metadata: Max 10 KiB per vector

**Patterns:**
```typescript
// Upsert with tenant namespace
await env.VECTORIZE.upsert(vectors, { namespace: tenantId });

// Query with tenant namespace
const results = await env.VECTORIZE.query(embedding, {
  namespace: tenantId,
  topK: 20,
  returnMetadata: true
});
```

### KV Namespaces

Three shared KV namespaces with tenant-prefixed keys:

| Binding | Purpose |
|---------|---------|
| `CONFIG` | Feature flags, allow-lists, non-sensitive config |
| `CACHE` | Response caching (TTL-based) |
| `RATE_LIMITER` | Rate limit state (deprecated in favor of DO) |

**Key prefixing:**
```typescript
const key = `${tenantId}:${resourceType}:${resourceId}`;
```

**Consistency:** ~60s eventual consistency for propagation.

### Durable Objects

Two DO classes with dedicated bindings:

| Binding | Class | Purpose |
|---------|-------|---------|
| `CHAT_SESSION` | `ChatSession` | Session history, retention enforcement |
| `RATE_LIMITER_DO` | `RateLimiter` | Sliding-window rate limiting |

**ID encoding:**
```typescript
const sessionId = env.CHAT_SESSION.idFromName(`${tenantId}:${sessionId}`);
const rateLimitId = env.RATE_LIMITER_DO.idFromName(`${tenantId}:${userId}:${ip}`);
```

**Why separate DO namespaces?**
- Prevents contention between session reads/writes and rate limit checks
- Allows independent scaling and migration
- Clear separation of concerns

### D1 (SQL)

Structured metadata storage (future):
- Session metadata
- Audit logs
- Token counts

**Note:** Raw prompts and messages are **never** stored in D1. Use Durable Objects for session state.

## Request Lifecycle (Detailed)

### 1. Tenant Resolution

Input: `Request` object  
Output: `TenantContext | null`

**Resolution order (highest priority first):**
1. `x-tenant-id` header
2. Host mapping (subdomain → tenantId)
3. API key mapping (key → tenantId)

**Implementation:**
```typescript
export async function withTenant(
  request: Request,
  env: Env,
  handler: (tenant: TenantContext, request: Request, env: Env) => Promise<Response>
): Promise<Response> {
  const tenant = await resolveTenant(request, env);
  if (!tenant) {
    return new Response(
      JSON.stringify({ error: 'Tenant required', requestId: crypto.randomUUID() }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }
  return handler(tenant, request, env);
}
```

### 2. Config Lookup

Load tenant configuration from the pre-built tenant index:

```typescript
const config = tenantIndex.byId[tenant.tenantId];
if (!config) {
  return fail(404, 'Unknown tenant', requestId);
}
```

### 3. Policy Enforcement

**Rate limiting:**
```typescript
const rateLimitKey = `${tenantId}:${userId}:${clientIp}`;
const rateLimiter = env.RATE_LIMITER_DO.idFromName(rateLimitKey);
const allowed = await rateLimiter.checkLimit(tenant.rateLimit);

if (!allowed) {
  return fail(429, 'Rate limit exceeded', requestId, {
    'X-RateLimit-Limit': tenant.rateLimit.perMinute,
    'X-RateLimit-Remaining': 0,
    'Retry-After': '60'
  });
}
```

**Feature flags (KV):**
```typescript
const flagKey = `${tenantId}:feature-flags:streaming-chat`;
const enabled = await env.CONFIG.get(flagKey) === 'true';
```

### 4. Route Handling

Dispatch to the appropriate handler based on path and method:

```typescript
if (pathname === '/chat' && method === 'POST') {
  return handleChat(tenant, request, env);
} else if (pathname.startsWith('/chat/') && method === 'GET') {
  return handleGetHistory(tenant, sessionId, env);
}
```

### 5. AI Gateway Calls

All model calls use the gateway wrapper:

```typescript
import { generateChat } from '@repo/ai/gateway';

const stream = await generateChat(
  tenant.tenantId,
  messages,
  { 
    model: tenant.aiModels.chat,
    stream: true 
  },
  env
);
```

### 6. Storage Operations

All storage methods require tenant context:

```typescript
// Session access
const session = env.CHAT_SESSION.idFromName(`${tenant.tenantId}:${sessionId}`);
await session.appendMessage({ role: 'user', content: message });

// KV cache
await putCache(tenant.tenantId, cacheKey, response, 3600, env);
```

### 7. Response Streaming

For chat endpoints, stream responses using SSE:

```typescript
const stream = new ReadableStream({
  async start(controller) {
    for await (const token of aiStream) {
      controller.enqueue(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
    }
    controller.enqueue(`event: done\ndata: ${JSON.stringify({ usage })}\n\n`);
    controller.close();
  }
});

return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  }
});
```

## Multi-Tenancy Enforcement

See **[Multi-Tenancy](Multi-Tenancy.md)** for detailed patterns.

**Key rules:**
1. Tenant resolution MUST run before any storage/AI access
2. All storage adapter methods MUST require `tenantId` as first parameter
3. KV keys MUST be prefixed with `${tenantId}:`
4. DO IDs MUST encode tenant via `idFromName(\`${tenantId}:...\`)`
5. Vectorize queries MUST use `namespace: tenantId`
6. AI calls MUST include `gateway.metadata: { tenantId }`

## Security Model

See **[Security Best Practices](Security-Best-Practices.md)** for full details.

**Key principles:**
1. **No secrets in repo** — Use `wrangler secret put`
2. **Zod validation** — All endpoints use Zod schemas
3. **Fail closed** — Reject requests on any validation failure
4. **Tenant isolation** — Zero cross-tenant data access
5. **Audit logging** — All mutations logged with requestId

## Performance Considerations

### KV Consistency

KV has ~60s eventual consistency. For critical data:
- Use Durable Objects for strong consistency
- Cache in memory for read-heavy workloads
- Document fallback behavior for flag changes

### Vectorize Limits

- **Top-K:** Max 20 results with metadata, 100 without
- **Metadata:** Max 10 KiB per vector
- For larger result sets, query without metadata and fetch in second pass

### DO Contention

- **Separate namespaces:** Use dedicated DO bindings for different use cases
- **Shard by tenant:** DO IDs include `tenantId` for natural sharding
- **Avoid global DOs:** Never create singleton DO instances

### Streaming Backpressure

- Use `TransformStream` for proper backpressure handling
- Never buffer entire response in memory
- Stream SSE events directly from AI Gateway response

## Next Steps

- **[Multi-Tenancy](Multi-Tenancy.md)** — Deep dive into tenant patterns
- **[Security Best Practices](Security-Best-Practices.md)** — Security guidelines
- **[Development Guide](Development-Guide.md)** — Development workflow
- **[API Reference](API-Reference.md)** — Endpoint documentation
