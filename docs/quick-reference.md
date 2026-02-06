# Tenant Isolation Quick Reference

One-page cheat sheet for correct tenant-scoped patterns.

## Request Handler Pattern

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. ALWAYS resolve tenant first
    const tenant = await resolveTenant(request, env);
    if (!tenant) {
      return new Response('Tenant required', { status: 400 });
    }
    
    // 2. Pass tenant to handler
    return handleRequest(tenant, request, env);
  }
};
```

## KV Pattern

```typescript
// ✅ Always prefix with tenantId
const key = `${tenantId}:${resourceType}:${resourceId}`;
await env.KV.get(key);
await env.KV.put(key, value, { expirationTtl: 3600 });

// Wrap in helper function
async function kvGet(tenantId: string, key: string, env: Env) {
  return env.KV.get(`${tenantId}:${key}`);
}
```

## Durable Objects Pattern

```typescript
// ✅ Always encode tenant in ID
function getDOStub(
  tenantId: string,
  resourceId: string,
  namespace: DurableObjectNamespace
): DurableObjectStub {
  const id = namespace.idFromName(`${tenantId}:${resourceId}`);
  return namespace.get(id);
}

// Usage
const sessionDO = getDOStub(tenant.tenantId, sessionId, env.SESSION_DO);
```

## Vectorize Pattern

```typescript
// ✅ Option 1: Per-tenant index (preferred)
const results = await env.VECTORIZE.query(vector, {
  namespace: `${tenantId}-embeddings`,
  topK: 10,
});

// ✅ Option 2: Shared index with filter
const results = await env.VECTORIZE.query(vector, {
  topK: 10,
  filter: { tenantId: { $eq: tenantId } },
});

// Always include tenant in metadata when upserting
await env.VECTORIZE.upsert([
  {
    id: vectorId,
    values: embedding,
    metadata: { tenantId, docId, chunkId },
  },
]);
```

## AI Gateway Pattern

```typescript
// ✅ NEVER call env.AI directly - always use wrapper
async function generateChat(
  tenantId: string,
  messages: ChatMessage[],
  tenant: TenantContext,
  env: Env
): Promise<ReadableStream> {
  const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${tenant.accountId}/${tenant.aiGatewayRoute}`;
  
  const response = await fetch(`${gatewayUrl}/workers-ai/${tenant.aiModels.chat}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-aig-metadata': JSON.stringify({ tenantId }),
    },
    body: JSON.stringify({ messages, stream: true }),
  });
  
  return response.body!;
}
```

## Rate Limiting Pattern

```typescript
// ✅ Tenant-scoped rate limit check
async function checkRateLimit(
  tenantId: string,
  userId: string,
  env: Env
): Promise<boolean> {
  const limiterDO = getDOStub(
    tenantId,
    `ratelimit:${userId}`,
    env.RATE_LIMITER_DO
  );
  
  const response = await limiterDO.fetch('https://internal/check');
  return response.ok;
}
```

## Caching Pattern

```typescript
// ✅ Include tenant in cache key
async function getCached(
  tenantId: string,
  cacheKey: string,
  env: Env
): Promise<string | null> {
  const key = `${tenantId}:cache:${cacheKey}`;
  return env.KV.get(key);
}

async function setCached(
  tenantId: string,
  cacheKey: string,
  value: string,
  ttl: number,
  env: Env
): Promise<void> {
  const key = `${tenantId}:cache:${cacheKey}`;
  await env.KV.put(key, value, { expirationTtl: ttl });
}
```

## Input Validation Pattern

```typescript
import { z } from 'zod';

// Define schema
const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  userId: z.string().optional(),
});

// Validate in handler
try {
  const body = await request.json();
  const validated = ChatRequestSchema.parse(body);
  // Use validated.sessionId, validated.message, etc.
} catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: error.errors }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }
  throw error;
}
```

## Logging Pattern

```typescript
// ✅ Always include tenant; NEVER log PII/secrets
function logRequest(
  tenantId: string,
  route: string,
  latencyMs: number,
  status: number
) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    tenantId,
    route,
    latencyMs,
    status,
    requestId: crypto.randomUUID(),
  }));
}

// ❌ Never log
// - Message content
// - User PII (email, name, etc.)
// - Tokens or API keys
// - Full error stack traces in production
```

## Error Handling Pattern

```typescript
async function handleRequest(
  tenant: TenantContext,
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Business logic
    return new Response('Success');
  } catch (error) {
    // Log with tenant context (redact sensitive data)
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      tenantId: tenant.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: crypto.randomUUID(),
    }));
    
    // Return generic error to client
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
```

## Streaming Response Pattern

```typescript
// ✅ Use TransformStream for proper backpressure
async function streamChatResponse(
  tenant: TenantContext,
  messages: ChatMessage[],
  env: Env
): Promise<Response> {
  const aiStream = await generateChat(tenant.tenantId, messages, tenant, env);
  
  // Transform AI stream to SSE format
  const { readable, writable } = new TransformStream();
  
  aiStream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(`data: ${chunk}\n\n`);
        },
      })
    )
    .pipeTo(writable);
  
  return new Response(readable, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    },
  });
}
```

## Type Definitions

```typescript
// packages/core/src/types.ts
export interface TenantContext {
  tenantId: string;
  accountId: string;
  aiGatewayRoute: string;
  aiModels: {
    chat: string;
    embeddings: string;
  };
  vectorizeIndex: string;
  rateLimit: {
    perMinute: number;
    burst: number;
  };
}

// packages/core/src/env.ts
export interface Env {
  AI: Ai;
  KV: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  VECTORIZE: VectorizeIndex;
  RATE_LIMITER_DO: DurableObjectNamespace;
  ENVIRONMENT: 'dev' | 'staging' | 'production';
}
```

## Function Signature Rules

```typescript
// ✅ tenantId is ALWAYS the first parameter
function operation(tenantId: string, ...otherParams): Promise<Result> {
  // Implementation
}

// Examples:
async function kvGet(tenantId: string, key: string, env: Env): Promise<string | null>
async function generateChat(tenantId: string, messages: ChatMessage[], tenant: TenantContext, env: Env): Promise<ReadableStream>
async function vectorizeQuery(tenantId: string, vector: number[], options: QueryOptions, env: Env): Promise<VectorizeMatches>
```

## Testing Checklist

```typescript
// Required tests for any tenant-aware feature:

✅ Rejects requests without tenant
✅ KV data isolated (tenant A cannot read tenant B's data)
✅ DO instances isolated (same resource ID, different tenants = different instances)
✅ Vectorize results isolated (tenant A sees only their vectors)
✅ Rate limits isolated (tenant A hitting limit doesn't affect tenant B)
✅ Cache isolated (tenant A's cache doesn't serve to tenant B)
✅ AI Gateway logs show correct tenant metadata
```

## Anti-Patterns (Never Do This)

```typescript
// ❌ Tenant in closure
function bad(tenantId: string) {
  return { get: (key) => kv.get(`${tenantId}:${key}`) };
}

// ❌ Tenant in class instance
class BadAdapter {
  constructor(private tenantId: string) {}
}

// ❌ Direct AI call
await env.AI.run(model, params);

// ❌ KV without tenant prefix
await env.KV.get(key);

// ❌ DO without tenant encoding
env.SESSION_DO.idFromName(sessionId);

// ❌ Vectorize without tenant filter
await env.VECTORIZE.query(vector);

// ❌ Caching without tenant
const cached = await cache.get(queryHash);
```
