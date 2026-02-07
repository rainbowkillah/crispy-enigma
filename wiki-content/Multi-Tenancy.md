# Multi-Tenancy

This document covers the multi-tenancy patterns, isolation strategies, and common pitfalls in the Crispy Enigma platform.

## Core Principle

**Every operation in the system is tenant-scoped.** There are no shared resources, no global state, and no cross-tenant access. Tenant isolation is enforced at compile-time (TypeScript signatures) and runtime (validation).

## Tenant Context

### TenantContext Type

All tenant information is encapsulated in the `TenantContext` type:

```typescript
export interface TenantContext {
  tenantId: string;              // Unique tenant identifier
  accountId: string;             // Cloudflare account ID
  aiGatewayId: string;          // AI Gateway identifier
  aiModels: {
    chat: string;                // Chat model (e.g., llama-3.1-8b-instruct)
    embeddings: string;          // Embedding model (e.g., bge-base-en-v1.5)
  };
  vectorizeNamespace: string;   // Vectorize namespace for this tenant
  rateLimit: {
    perMinute: number;           // Requests per minute
    burst: number;               // Burst capacity
  };
  sessionRetentionDays?: number;    // Session retention (default: 30)
  maxMessagesPerSession?: number;   // Max messages (default: 1000)
}
```

### Tenant Resolution

Tenant resolution happens **before any business logic executes**. It follows a priority order:

1. **`x-tenant-id` header** (highest priority)
2. **Host mapping** (subdomain → tenantId)
3. **API key mapping** (API key → tenantId)

```typescript
export async function resolveTenant(
  request: Request, 
  env: Env
): Promise<TenantContext | null> {
  // 1. Check header
  const headerTenantId = request.headers.get('x-tenant-id');
  if (headerTenantId) {
    return tenantIndex.byId[headerTenantId] || null;
  }

  // 2. Check host
  const url = new URL(request.url);
  const host = url.hostname;
  const tenantByHost = tenantIndex.byHost[host];
  if (tenantByHost) {
    return tenantByHost;
  }

  // 3. Check API key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    const tenantByKey = tenantIndex.byApiKey[apiKey];
    if (tenantByKey) {
      return tenantByKey;
    }
  }

  return null;  // No tenant found
}
```

### Middleware Pattern

Use this middleware pattern in all Workers:

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

// Usage in Worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withTenant(request, env, handleRequest);
  }
};
```

## Storage Isolation Patterns

### KV Keys

**Rule:** Always prefix keys with `${tenantId}:`.

```typescript
// ✅ CORRECT: Tenant-scoped key
async function getFeatureFlag(tenantId: string, flagName: string, env: Env): Promise<boolean> {
  const key = `${tenantId}:feature-flags:${flagName}`;
  const value = await env.CONFIG.get(key);
  return value === 'true';
}

// ❌ WRONG: No tenant prefix
async function getFeatureFlag(flagName: string, env: Env): Promise<boolean> {
  const value = await env.CONFIG.get(flagName);  // Cross-tenant leak!
  return value === 'true';
}
```

**Key format conventions:**
```
${tenantId}:feature-flags:${flagName}
${tenantId}:cache:${cacheKey}
${tenantId}:config:${configKey}
${tenantId}:rate-limit:${userId}:${ip}
```

### Durable Object IDs

**Rule:** Encode tenant in the DO ID using `idFromName()`.

```typescript
// ✅ CORRECT: Tenant encoded in ID
function getSessionDO(tenantId: string, sessionId: string, env: Env): DurableObjectStub {
  const id = env.CHAT_SESSION.idFromName(`${tenantId}:${sessionId}`);
  return env.CHAT_SESSION.get(id);
}

// ❌ WRONG: Tenant not encoded
function getSessionDO(sessionId: string, env: Env): DurableObjectStub {
  const id = env.CHAT_SESSION.idFromName(sessionId);  // Cross-tenant access possible!
  return env.CHAT_SESSION.get(id);
}
```

**ID format conventions:**
```
${tenantId}:${sessionId}
${tenantId}:${userId}:${ip}
${tenantId}:${resourceType}:${resourceId}
```

**Why `idFromName()` vs `idFromString()`?**
- `idFromName()` creates **deterministic** IDs from strings
- Same input always produces same ID
- Enables tenant+resource lookup without a registry
- Critical for tenant isolation

### Vectorize Namespaces

**Rule:** Use the `namespace` parameter for tenant isolation.

```typescript
// ✅ CORRECT: Tenant namespace
async function queryVectorize(tenantId: string, embedding: number[], env: Env) {
  const results = await env.VECTORIZE.query(embedding, {
    namespace: tenantId,  // Tenant isolation at vector search level
    topK: 20,
    returnMetadata: true
  });
  return results;
}

// ❌ WRONG: No namespace
async function queryVectorize(embedding: number[], env: Env) {
  const results = await env.VECTORIZE.query(embedding, {
    topK: 20  // Searches across ALL tenants!
  });
  return results;
}
```

**Fallback: Metadata filtering**

If namespaces aren't used, filter by metadata:

```typescript
// ✅ Acceptable: Metadata filter (less efficient)
async function queryVectorize(tenantId: string, embedding: number[], env: Env) {
  const results = await env.VECTORIZE.query(embedding, {
    topK: 20,
    filter: { tenantId: { $eq: tenantId } },  // Post-search filter
    returnMetadata: true
  });
  return results;
}
```

**Namespace vs Metadata:**
- **Namespace (preferred):** Applied BEFORE vector search, more efficient
- **Metadata filter:** Applied AFTER vector search, less efficient
- **Limit:** Up to 50K namespaces per index (paid plan)

### D1 (SQL) Isolation

**Rule:** Use tenant-specific databases OR tenant column in all tables.

**Option 1: Tenant-specific databases (preferred)**
```jsonc
// tenants/acme/wrangler.jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "acme-db",
      "database_id": "..."
    }
  ]
}
```

**Option 2: Shared database with tenant column**
```sql
CREATE TABLE sessions (
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, session_id)
);

CREATE INDEX idx_tenant_sessions ON sessions(tenant_id);
```

```typescript
// All queries MUST filter by tenant_id
const sessions = await env.DB.prepare(
  'SELECT * FROM sessions WHERE tenant_id = ? AND session_id = ?'
).bind(tenantId, sessionId).all();
```

## Explicit Tenant Parameters

### The Golden Rule

**Every storage/AI method MUST require `tenantId: string` as the first parameter.**

This prevents accidental tenant context hiding and makes boundaries explicit.

```typescript
// ✅ CORRECT: Explicit tenant parameter
interface KVAdapter {
  get(tenantId: string, key: string, env: Env): Promise<string | null>;
  put(tenantId: string, key: string, value: string, env: Env): Promise<void>;
}

// Implementation
export async function getKV(tenantId: string, key: string, env: Env): Promise<string | null> {
  const scopedKey = `${tenantId}:${key}`;
  return env.CONFIG.get(scopedKey);
}
```

```typescript
// ❌ WRONG: Hidden tenant in closure
class KVAdapter {
  constructor(private tenantId: string, private env: Env) {}
  
  async get(key: string): Promise<string | null> {
    // tenantId captured in closure - boundary hidden!
    const scopedKey = `${this.tenantId}:${key}`;
    return this.env.CONFIG.get(scopedKey);
  }
}
```

### Why Explicit Parameters?

1. **Compile-time enforcement:** TypeScript requires tenant at call site
2. **Audit trail:** Easy to grep for all tenant-scoped operations
3. **Testing:** Easier to mock and verify tenant isolation
4. **No hidden state:** Function signatures reveal all dependencies

## AI Gateway Integration

### Gateway Metadata

All AI calls must include `tenantId` in gateway metadata:

```typescript
// ✅ CORRECT: Gateway with tenant metadata
import { generateChat } from '@repo/ai/gateway';

const response = await generateChat(
  tenantId,  // Explicit tenant parameter
  messages,
  { 
    model: tenant.aiModels.chat,
    stream: true,
    gateway: {
      id: tenant.aiGatewayId,
      metadata: { tenantId }  // Attribution in gateway logs
    }
  },
  env
);
```

```typescript
// ❌ WRONG: Direct Workers AI call
const response = await env.AI.run(
  '@cf/meta/llama-2-7b-chat-int8',
  { messages, stream: true }
  // No gateway = no attribution!
);
```

### Gateway Metadata Rules

- **Max 5 key-value pairs**
- **Keys:** Alphanumeric + underscore
- **Values:** String, number, or boolean only
- **Purpose:** Cost attribution, usage tracking, conditional routing

```typescript
// ✅ Valid metadata
gateway: {
  id: 'demo-gateway',
  metadata: {
    tenantId: 'acme',
    userId: 'user-123',
    feature: 'chat',
    version: 1,
    experimental: false
  }
}
```

## Rate Limiting

### Tenant-Scoped Rate Limits

Rate limits are applied per-tenant, with additional scoping by user/IP:

```typescript
// Rate limit key format
const rateLimitKey = `${tenantId}:${userId}:${clientIp}`;

// Get rate limiter DO
const rateLimiterId = env.RATE_LIMITER_DO.idFromName(rateLimitKey);
const rateLimiter = env.RATE_LIMITER_DO.get(rateLimiterId);

// Check limit
const allowed = await rateLimiter.checkLimit({
  perMinute: tenant.rateLimit.perMinute,
  burst: tenant.rateLimit.burst
});

if (!allowed) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

### Why Separate DO Binding?

The `RATE_LIMITER_DO` binding is separate from `CHAT_SESSION`:

- **Prevents contention:** Session reads/writes don't block rate limit checks
- **Independent scaling:** Rate limiting and sessions scale separately
- **Clear separation:** Different responsibilities, different namespaces

## Common Pitfalls (Footguns)

### 1. Forgetting Tenant Resolution

```typescript
// ❌ WRONG: Accessing storage before tenant resolution
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const value = await env.CONFIG.get('some-key');  // Which tenant?
    return new Response(value);
  }
};
```

**Fix:** Always resolve tenant first
```typescript
// ✅ CORRECT
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withTenant(request, env, async (tenant, req, env) => {
      const value = await getKV(tenant.tenantId, 'some-key', env);
      return new Response(value);
    });
  }
};
```

### 2. Caching Without Tenant Awareness

```typescript
// ❌ WRONG: Cache key without tenant
const cacheKey = `response:${query}`;
const cached = await env.CACHE.get(cacheKey);  // Cross-tenant leak!
```

**Fix:** Include tenant in cache key
```typescript
// ✅ CORRECT
const cacheKey = `${tenantId}:response:${query}`;
const cached = await env.CACHE.get(cacheKey);
```

### 3. Global DO Instances

```typescript
// ❌ WRONG: Singleton DO (not tenant-scoped)
const globalDO = env.SOME_DO.idFromName('global');
```

**Fix:** Always encode tenant
```typescript
// ✅ CORRECT
const tenantDO = env.SOME_DO.idFromName(`${tenantId}:resource-id`);
```

### 4. Vectorize Without Namespace

```typescript
// ❌ WRONG: Query without namespace
const results = await env.VECTORIZE.query(embedding, { topK: 20 });
// Searches ALL tenants!
```

**Fix:** Use namespace parameter
```typescript
// ✅ CORRECT
const results = await env.VECTORIZE.query(embedding, {
  namespace: tenantId,
  topK: 20
});
```

### 5. Direct Workers AI Calls

```typescript
// ❌ WRONG: Bypassing AI Gateway
const response = await env.AI.run(model, { messages });
// No attribution, no budget enforcement!
```

**Fix:** Use gateway wrapper
```typescript
// ✅ CORRECT
import { generateChat } from '@repo/ai/gateway';
const response = await generateChat(tenantId, messages, options, env);
```

### 6. KV Eventual Consistency

```typescript
// ❌ WRONG: Expecting immediate consistency
await env.CONFIG.put(`${tenantId}:flag`, 'true');
const value = await env.CONFIG.get(`${tenantId}:flag`);
// Might still be old value!
```

**Mitigation:**
- Use Durable Objects for strong consistency
- Cache reads in memory with cache-aside pattern
- Document eventual consistency in API contracts

## Testing Tenant Isolation

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { getSessionDO } from './storage';

describe('Session DO isolation', () => {
  it('should encode tenant in DO ID', () => {
    const tenantA_SessionA = getSessionDO('tenant-a', 'session-1', env);
    const tenantB_SessionA = getSessionDO('tenant-b', 'session-1', env);
    
    // Different tenants = different DOs, even with same session ID
    expect(tenantA_SessionA.id.toString()).not.toEqual(tenantB_SessionA.id.toString());
  });

  it('should reject cross-tenant access', async () => {
    const tenantA_SessionA = getSessionDO('tenant-a', 'session-1', env);
    
    // Attempt to access with wrong tenant should fail
    await expect(
      tenantA_SessionA.getHistory('tenant-b', 'session-1')
    ).rejects.toThrow('Tenant mismatch');
  });
});
```

### Integration Tests

```typescript
describe('Tenant isolation (integration)', () => {
  it('should isolate KV data', async () => {
    await putKV('tenant-a', 'key', 'value-a', env);
    await putKV('tenant-b', 'key', 'value-b', env);
    
    const valueA = await getKV('tenant-a', 'key', env);
    const valueB = await getKV('tenant-b', 'key', env);
    
    expect(valueA).toBe('value-a');
    expect(valueB).toBe('value-b');
  });

  it('should isolate Vectorize namespaces', async () => {
    const embedding = [0.1, 0.2, 0.3];
    
    await env.VECTORIZE.upsert([{ id: 'doc-1', values: embedding }], { namespace: 'tenant-a' });
    await env.VECTORIZE.upsert([{ id: 'doc-1', values: embedding }], { namespace: 'tenant-b' });
    
    const resultsA = await env.VECTORIZE.query(embedding, { namespace: 'tenant-a', topK: 10 });
    const resultsB = await env.VECTORIZE.query(embedding, { namespace: 'tenant-b', topK: 10 });
    
    // Should only find docs in their respective namespaces
    expect(resultsA.matches.length).toBe(1);
    expect(resultsB.matches.length).toBe(1);
  });
});
```

## Tenant Configuration

### tenant.config.json

Each tenant has a configuration file:

```json
{
  "tenantId": "acme-corp",
  "accountId": "cloudflare-account-id",
  "aiGatewayId": "acme-gateway",
  "aiModels": {
    "chat": "@cf/meta/llama-3.1-8b-instruct",
    "embeddings": "@cf/baai/bge-base-en-v1.5"
  },
  "vectorizeNamespace": "acme-embeddings",
  "rateLimit": {
    "perMinute": 100,
    "burst": 20
  },
  "sessionRetentionDays": 30,
  "maxMessagesPerSession": 1000
}
```

### wrangler.jsonc

Cloudflare bindings are defined per-tenant:

```jsonc
{
  "name": "worker-api-acme",
  "main": "src/index.ts",
  "compatibility_date": "2024-02-15",
  "durable_objects": {
    "bindings": [
      { "name": "CHAT_SESSION", "class_name": "ChatSession" },
      { "name": "RATE_LIMITER_DO", "class_name": "RateLimiter" }
    ]
  },
  "kv_namespaces": [
    { "binding": "CONFIG", "id": "..." },
    { "binding": "CACHE", "id": "..." }
  ],
  "vectorize": [
    { "binding": "VECTORIZE", "index_name": "acme-embeddings" }
  ],
  "ai": { "binding": "AI" }
}
```

## Best Practices

### 1. Tenant-First Function Signatures

```typescript
// ✅ Good
function processTenantData(tenantId: string, data: unknown, env: Env): Result;

// ❌ Bad
function processData(data: unknown, env: Env): Result;
```

### 2. Fail Closed

```typescript
// ✅ Good: Reject on missing tenant
if (!tenant) {
  return fail(400, 'Tenant required');
}

// ❌ Bad: Default to shared tenant
const tenant = resolveTenant(request) || { tenantId: 'shared' };
```

### 3. Explicit Resource Naming

```typescript
// ✅ Good: Clear tenant scope
const sessionKey = `${tenantId}:session:${sessionId}`;

// ❌ Bad: Ambiguous scope
const sessionKey = `session-${sessionId}`;
```

### 4. Document Tenant Boundaries

```typescript
/**
 * Retrieves session history for a tenant.
 * 
 * @param tenantId - Tenant identifier (required for isolation)
 * @param sessionId - Session identifier (scoped to tenant)
 * @param env - Cloudflare bindings
 * @throws {Error} If tenant or session not found
 */
export async function getSessionHistory(
  tenantId: string,
  sessionId: string,
  env: Env
): Promise<Message[]> {
  // ...
}
```

## Security Implications

Multi-tenancy is a **security boundary**. Failure to enforce tenant isolation can lead to:

- **Data leaks** — Cross-tenant data access
- **Quota abuse** — One tenant consuming another's resources
- **Cost attribution errors** — Incorrect billing
- **Compliance violations** — GDPR, HIPAA, SOC 2

**See [Security Best Practices](Security-Best-Practices.md) for more details.**

## Next Steps

- **[Security Best Practices](Security-Best-Practices.md)** — Security guidelines
- **[Development Guide](Development-Guide.md)** — Development workflow
- **[Testing Guide](Testing-Guide.md)** — Testing strategies
- **[Troubleshooting](Troubleshooting.md)** — Common issues
