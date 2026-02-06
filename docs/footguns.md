# Tenant Isolation Footguns & Mitigations

This doc catalogs common mistakes that break tenant isolation and how to avoid them.

## 🔴 Critical Footguns

### 1. Forgetting Tenant Resolution

**Symptom**: Requests bypass tenant checks and access shared resources directly.

**Wrong** ❌:
```typescript
export default {
  async fetch(request: Request, env: Env) {
    // Direct storage access without tenant check!
    const config = await env.KV.get('app-config');
    return new Response(config);
  }
};
```

**Right** ✅:
```typescript
export default {
  async fetch(request: Request, env: Env) {
    const tenant = await resolveTenant(request, env);
    if (!tenant) {
      return new Response('Tenant required', { status: 400 });
    }
    
    // Now safe to proceed with tenant context
    const config = await getConfig(tenant.tenantId, env);
    return new Response(config);
  }
};
```

**Mitigation**:
- Use middleware pattern that enforces tenant resolution
- Add linter rule to flag `env.KV`, `env.AI` usage outside tenant handlers
- Add integration test that verifies tenant rejection

---

### 2. KV Keys Without Tenant Prefix

**Symptom**: Data leaks across tenants; one tenant can read another's cache/config.

**Wrong** ❌:
```typescript
// sessionId might collide across tenants!
await env.KV.put(sessionId, JSON.stringify(data));
```

**Right** ✅:
```typescript
// Tenant prefix ensures isolation
const key = `${tenantId}:sessions:${sessionId}`;
await env.KV.put(key, JSON.stringify(data));
```

**Mitigation**:
- Create adapter functions that enforce prefixing: `kvGet(tenantId, key)`
- Never pass raw `env.KV` to functions; always wrap it
- Add test: write data for tenant A, verify tenant B cannot read it

---

### 3. Durable Object IDs Without Tenant Encoding

**Symptom**: Sessions/state collide across tenants; one tenant sees another's data.

**Wrong** ❌:
```typescript
// sessionId alone is not tenant-scoped!
const id = env.SESSION_DO.idFromName(sessionId);
const stub = env.SESSION_DO.get(id);
```

**Right** ✅:
```typescript
// Encode tenant in the ID itself
const id = env.SESSION_DO.idFromName(`${tenantId}:${sessionId}`);
const stub = env.SESSION_DO.get(id);
```

**Mitigation**:
- Always use `tenantId:resourceId` pattern for `idFromName()`
- Create helper: `getDOStub(tenantId, resourceId, namespace)`
- Add test: verify tenant A cannot access tenant B's DO instance

---

### 4. Shared Vectorize Index Without Metadata Filtering

**Symptom**: Search results leak across tenants; tenant A sees tenant B's documents.

**Wrong** ❌:
```typescript
// Query entire index - no tenant filter!
const results = await env.VECTORIZE.query(vector, { topK: 10 });
```

**Right** ✅ (Option 1: Per-tenant index):
```typescript
// Use separate index per tenant (preferred for strong isolation)
const indexName = `${tenantId}-embeddings`;
const results = await env.VECTORIZE.query(vector, {
  namespace: indexName,
  topK: 10,
});
```

**Right** ✅ (Option 2: Shared index with filter):
```typescript
// Use metadata filter if sharing one index
const results = await env.VECTORIZE.query(vector, {
  topK: 10,
  filter: { tenantId: { $eq: tenantId } },
});
```

**Mitigation**:
- Prefer per-tenant indexes for production
- If using shared index, wrap all queries with tenant filter
- Add test: upsert vectors for tenant A, verify tenant B's query returns zero results
- Add metadata size check: keep `{ tenantId, docId, chunkId }` under 1KB

---

### 5. Direct Workers AI Calls (Bypassing Gateway)

**Symptom**: No usage tracking, no cost attribution, no policy enforcement.

**Wrong** ❌:
```typescript
// Bypasses AI Gateway - no observability!
const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
  messages,
});
```

**Right** ✅:
```typescript
// Route through gateway wrapper
import { generateChat } from '@repo/ai/gateway';

const response = await generateChat(
  tenantId,
  messages,
  { model: tenant.aiModels.chat },
  env
);
```

**Mitigation**:
- Never import `env.AI` directly; always use gateway wrapper
- Add linter rule to ban `env.AI.run()` outside gateway package
- Add integration test: verify all AI calls appear in gateway logs

---

### 6. Caching Without Tenant Awareness

**Symptom**: Cached responses served to wrong tenant; stale data persists cross-tenant.

**Wrong** ❌:
```typescript
// Cache key based only on query - tenant-agnostic!
const cacheKey = `search:${JSON.stringify(query)}`;
const cached = await env.KV.get(cacheKey);
```

**Right** ✅:
```typescript
// Include tenant in cache key
const cacheKey = `${tenantId}:search:${JSON.stringify(query)}`;
const cached = await env.KV.get(cacheKey);
```

**Mitigation**:
- Always prefix cache keys with `tenantId:`
- Use cache helper: `getCached(tenantId, key)`, `setCached(tenantId, key, value, ttl)`
- Add test: cache data for tenant A, verify tenant B gets cache miss

---

### 7. Hidden Tenant Context in Closures/Classes

**Symptom**: Tenant boundary unclear; hard to audit; easy to forget in refactors.

**Wrong** ❌:
```typescript
// tenantId captured in closure - not visible in call site
function createAdapter(tenantId: string, env: Env) {
  return {
    getSession: async (sessionId: string) => {
      const id = env.SESSION_DO.idFromName(`${tenantId}:${sessionId}`);
      return env.SESSION_DO.get(id);
    },
  };
}

// Call site doesn't show tenant is involved
const adapter = createAdapter(tenant.tenantId, env);
const session = await adapter.getSession(sessionId); // Where's tenantId?
```

**Right** ✅:
```typescript
// tenantId explicit in every call
function getSessionDO(tenantId: string, sessionId: string, env: Env) {
  const id = env.SESSION_DO.idFromName(`${tenantId}:${sessionId}`);
  return env.SESSION_DO.get(id);
}

// Call site makes tenant boundary clear
const session = getSessionDO(tenant.tenantId, sessionId, env);
```

**Mitigation**:
- Require `tenantId: string` as first parameter in all storage/AI functions
- Avoid classes/closures that capture tenant context
- Code review checklist: "Can I see tenantId at the call site?"

---

### 8. Rate Limiting Without Tenant Scope

**Symptom**: One tenant consumes entire rate limit budget; no per-tenant fairness.

**Wrong** ❌:
```typescript
// Global rate limiter affects all tenants
const allowed = await checkGlobalRateLimit(userId);
```

**Right** ✅:
```typescript
// Per-tenant rate limiting
const allowed = await checkRateLimit(tenantId, userId, tenant.rateLimit);
```

**Mitigation**:
- Rate limit keys must include tenant: `ratelimit:${tenantId}:${userId}`
- Use separate DO instance per tenant for rate limiting
- Add test: verify tenant A hitting limit doesn't block tenant B

---

## 🟡 Medium Footguns

### 9. KV Eventual Consistency for Feature Flags

**Symptom**: Feature flag changes take 60+ seconds to propagate; confusing in dev/debug.

**Mitigation**:
- Document propagation delay (~60s) in runbook
- Use default-safe flags: `{ enableNewFeature: false }` so app works during propagation
- For immediate feedback, add admin endpoint that bypasses cache
- Consider DO for critical real-time flags (higher cost, stronger consistency)

---

### 10. Vectorize Metadata Size Limits

**Symptom**: Upsert fails with cryptic error when metadata exceeds 1KB per vector.

**Mitigation**:
- Keep metadata minimal: `{ tenantId, docId, chunkId, source }`
- Don't store full text in metadata; use it only for filtering/citing
- Add validation: assert metadata JSON size < 1KB before upsert
- Add test: verify upsert fails gracefully when metadata too large

---

### 11. Streaming Response Buffering

**Symptom**: Streaming appears "stuck"; AI tokens arrive in large bursts instead of smoothly.

**Wrong** ❌:
```typescript
// Response.body buffers internally
return new Response(aiStream);
```

**Right** ✅:
```typescript
// Use TransformStream for proper backpressure
const { readable, writable } = new TransformStream();
aiStream.pipeTo(writable);
return new Response(readable, {
  headers: { 'content-type': 'text/event-stream' },
});
```

**Mitigation**:
- Always use `TransformStream` for streaming responses
- Test with slow consumer (throttled client) to verify no buffering
- Monitor latency to first byte (TTFB) metric

---

### 12. DO Instance Contention

**Symptom**: High latency on popular sessions; DO becomes bottleneck.

**Mitigation**:
- Scope DOs narrowly: `${tenantId}:${sessionId}`, not `${tenantId}:all-sessions`
- Avoid global DO instances that handle all traffic for a tenant
- For high-write scenarios, consider sharding: `${tenantId}:shard-${hash(id) % 10}`
- Monitor DO CPU time and request queue depth

---

## 🟢 Testing Strategies

### Tenant Isolation Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('Tenant isolation', () => {
  it('should reject requests without tenant', async () => {
    const response = await worker.fetch(new Request('https://example.com/chat'));
    expect(response.status).toBe(400);
  });

  it('should not leak KV data across tenants', async () => {
    // Write data for tenant A
    await kvPut('tenant-a', 'key1', 'secret-a');
    
    // Verify tenant B cannot read it
    const value = await kvGet('tenant-b', 'key1');
    expect(value).toBeNull();
  });

  it('should not leak DO state across tenants', async () => {
    // Create session for tenant A
    const doA = getSessionDO('tenant-a', 'session-1', env);
    await doA.fetch('https://internal/set', { 
      method: 'POST',
      body: JSON.stringify({ data: 'secret' }),
    });
    
    // Verify tenant B with same session ID gets different instance
    const doB = getSessionDO('tenant-b', 'session-1', env);
    const response = await doB.fetch('https://internal/get');
    const data = await response.json();
    expect(data).not.toEqual('secret');
  });

  it('should not leak Vectorize results across tenants', async () => {
    // Upsert vectors for tenant A
    await vectorizeUpsert('tenant-a', [
      { id: 'doc1', values: [0.1, 0.2], metadata: { tenantId: 'tenant-a' } },
    ]);
    
    // Query as tenant B - should return zero results
    const results = await vectorizeQuery('tenant-b', [0.1, 0.2], { topK: 10 });
    expect(results.matches).toHaveLength(0);
  });
});
```

---

## 📋 Pre-Deployment Checklist

Before deploying any tenant-aware code:

- [ ] All storage operations require explicit `tenantId` parameter
- [ ] No `env.KV.get()`, `env.AI.run()` called outside adapters
- [ ] All DO IDs encode tenant: `idFromName(`${tenantId}:${id}`)`
- [ ] All Vectorize queries filter by tenant (or use per-tenant index)
- [ ] All AI calls route through gateway wrapper
- [ ] All cache keys prefixed with tenant
- [ ] Rate limiting is per-tenant
- [ ] Integration tests verify cross-tenant isolation
- [ ] Logs include `tenantId` field; no PII logged
- [ ] Secrets loaded from wrangler secrets, not committed .env

---

## 🔍 Audit Commands

```bash
# Find potential KV calls without tenant scoping
grep -rn "env.KV.get\|env.KV.put" apps/ packages/

# Find potential direct AI calls (should be rare)
grep -rn "env.AI.run" apps/ packages/

# Find DO access without tenant encoding (should be in helpers only)
grep -rn "idFromName" apps/ packages/

# Check for hardcoded secrets (should return nothing)
grep -rn "API_KEY\|SECRET\|TOKEN" apps/ packages/ --exclude-dir=node_modules
```

---

## 📚 Further Reading

- [Cloudflare Workers Durable Objects Docs](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)
- [Cloudflare AI Gateway Docs](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare Vectorize Docs](https://developers.cloudflare.com/vectorize/)
- [Multi-tenancy Best Practices](https://aws.amazon.com/blogs/apn/multi-tenant-design-considerations-for-saas-applications-on-aws/) (AWS but principles apply)
