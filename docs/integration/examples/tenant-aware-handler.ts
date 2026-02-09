/**
 * Example: Tenant-aware request handler
 * 
 * This demonstrates the correct pattern for building Workers that enforce
 * tenant isolation at every layer.
 * 
 * Key principles:
 * 1. Resolve tenant FIRST, before any other operations
 * 2. Pass tenantId explicitly to all storage/AI functions
 * 3. Never hide tenant context in closures or class instances
 * 4. Route all AI calls through the gateway wrapper
 */

import { z } from 'zod';

// ============================================================================
// Types (from packages/core)
// ============================================================================

export interface TenantContext {
  tenantId: string;
  accountId: string;
  aiGatewayId: string;
  aiModels: {
    chat: keyof AiModels;
    embeddings: keyof AiModels;
  };
  vectorizeNamespace: string;
  rateLimit: {
    perMinute: number;
    burst: number;
  };
}

export interface Env {
  AI: Ai;
  KV: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  RATE_LIMITER_DO: DurableObjectNamespace;
  VECTORIZE: Vectorize;  // V2 type (not VectorizeIndex)
}

// ============================================================================
// Tenant Resolution (packages/core/tenant.ts)
// ============================================================================

async function resolveTenant(request: Request, env: Env): Promise<TenantContext | null> {
  // Priority 1: x-tenant-id header
  const headerTenantId = request.headers.get('x-tenant-id');
  if (headerTenantId) {
    return loadTenantConfig(headerTenantId, env);
  }

  // Priority 2: hostname mapping (e.g., acme.example.com -> acme-corp)
  const hostname = new URL(request.url).hostname;
  const tenantId = await mapHostnameToTenant(hostname, env);
  if (tenantId) {
    return loadTenantConfig(tenantId, env);
  }

  // No tenant found
  return null;
}

async function loadTenantConfig(tenantId: string, env: Env): Promise<TenantContext> {
  // Load from KV cache (tenant-scoped key)
  const key = `tenant-config:${tenantId}`;
  const cached = await env.KV.get(key, 'json');
  
  if (cached) {
    return cached as TenantContext;
  }

  // In production, fetch from config service or load from embedded configs
  throw new Error(`Tenant config not found: ${tenantId}`);
}

async function mapHostnameToTenant(hostname: string, env: Env): Promise<string | null> {
  // Example: Look up hostname -> tenantId mapping in KV
  const mapping = await env.KV.get(`hostname-map:${hostname}`);
  return mapping;
}

// ============================================================================
// Storage Adapters (packages/storage)
// ============================================================================

// ✅ CORRECT: tenantId is explicit parameter, not hidden
async function getCachedResponse(
  tenantId: string,
  cacheKey: string,
  env: Env
): Promise<string | null> {
  // Tenant-scoped KV key
  const key = `${tenantId}:cache:${cacheKey}`;
  return env.KV.get(key);
}

async function setCachedResponse(
  tenantId: string,
  cacheKey: string,
  value: string,
  ttl: number,
  env: Env
): Promise<void> {
  const key = `${tenantId}:cache:${cacheKey}`;
  await env.KV.put(key, value, { expirationTtl: ttl });
}

// ✅ CORRECT: Tenant-scoped Durable Object access
function getSessionDO(
  tenantId: string,
  sessionId: string,
  env: Env
): DurableObjectStub {
  // Encode tenant in DO ID to ensure isolation
  const id = env.SESSION_DO.idFromName(`${tenantId}:${sessionId}`);
  return env.SESSION_DO.get(id);
}

// ============================================================================
// AI Gateway Wrapper (packages/ai)
// ============================================================================

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ✅ CORRECT: Route through AI Gateway via binding with tenant context
async function generateChat(
  tenantId: string,
  messages: ChatMessage[],
  tenant: TenantContext,
  env: Env
): Promise<ReadableStream> {
  // Use AI binding with gateway parameter (recommended approach)
  // No need for account ID or API tokens — binding handles auth automatically
  const response = await env.AI.run(
    tenant.aiModels.chat,
    { messages, stream: true },
    {
      gateway: {
        id: tenant.aiGatewayId,
        metadata: { tenantId },  // up to 5 entries; string/number/boolean only
      },
    }
  );

  return response as ReadableStream;
}

// ============================================================================
// Rate Limiting (packages/core/rate-limit.ts)
// ============================================================================

async function checkRateLimit(
  tenantId: string,
  userId: string,
  env: Env
): Promise<{ allowed: boolean; remaining: number }> {
  // Use dedicated RATE_LIMITER_DO namespace (not SESSION_DO)
  const id = env.RATE_LIMITER_DO.idFromName(`${tenantId}:${userId}`);
  const stub = env.RATE_LIMITER_DO.get(id);

  const response = await stub.fetch('https://internal/check-limit', {
    method: 'POST',
  });

  return response.json();
}

// ============================================================================
// Request Handler (apps/worker-api)
// ============================================================================

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  userId: z.string().optional(),
});

async function handleChatRequest(
  tenant: TenantContext,
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // 1. Validate input
    const body = await request.json();
    const { sessionId, message, userId } = ChatRequestSchema.parse(body);

    // 2. Check rate limit (tenant-scoped)
    const rateLimit = await checkRateLimit(
      tenant.tenantId,
      userId || 'anonymous',
      env
    );
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', remaining: 0 }),
        { status: 429, headers: { 'content-type': 'application/json' } }
      );
    }

    // 3. Load session history (tenant-scoped DO)
    const sessionDO = getSessionDO(tenant.tenantId, sessionId, env);
    const historyResponse = await sessionDO.fetch('https://internal/history');
    const history: ChatMessage[] = await historyResponse.json();

    // 4. Build messages array
    const messages: ChatMessage[] = [
      ...history,
      { role: 'user', content: message },
    ];

    // 5. Generate response via AI Gateway (tenant-scoped)
    const stream = await generateChat(tenant.tenantId, messages, tenant, env);

    // 6. Save message to session (tenant-scoped DO)
    await sessionDO.fetch('https://internal/append', {
      method: 'POST',
      body: JSON.stringify({ role: 'user', content: message }),
    });

    // 7. Return streaming response
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'x-tenant-id': tenant.tenantId, // For debugging
      },
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: error.errors }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Log error with tenant context (but redact sensitive data)
    console.error('Chat error', {
      tenantId: tenant.tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
      // ❌ Do NOT log: message content, user PII, tokens
    });

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

// ============================================================================
// Worker Entry Point
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CRITICAL: Resolve tenant FIRST, before any other operations
    const tenant = await resolveTenant(request, env);
    
    if (!tenant) {
      return new Response(
        JSON.stringify({
          error: 'Tenant required',
          hint: 'Provide x-tenant-id header or use tenant-specific hostname',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Route to handler with tenant context
    const url = new URL(request.url);
    
    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChatRequest(tenant, request, env);
    }

    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          tenant: tenant.tenantId,
          version: '1.0.0',
        }),
        { headers: { 'content-type': 'application/json' } }
      );
    }

    return new Response('Not found', { status: 404 });
  },
};

// ============================================================================
// Anti-Patterns to AVOID
// ============================================================================

// ❌ WRONG: Tenant context hidden in closure
function createBadAdapter(tenantId: string, env: Env) {
  return {
    // tenantId is captured from closure - not explicit!
    getCache: (key: string) => env.KV.get(`${tenantId}:${key}`),
  };
}

// ❌ WRONG: Tenant context in class instance
class BadKVAdapter {
  constructor(private tenantId: string, private kv: KVNamespace) {}
  
  async get(key: string) {
    // tenantId is hidden in instance - not explicit!
    return this.kv.get(`${this.tenantId}:${key}`);
  }
}

// ❌ WRONG: Direct Workers AI call without gateway param
async function badAICall(env: Env, messages: ChatMessage[]) {
  const model = '@cf/meta/llama-3.1-8b-instruct' as keyof AiModels;
  return env.AI.run(model, {
    messages,
    stream: true,
  });
  // Missing { gateway: { id, metadata: { tenantId } } }
  // No tenant tracking, no usage metrics, no policy enforcement!
}

// ❌ WRONG: KV key without tenant prefix
async function badCache(env: Env, cacheKey: string) {
  return env.KV.get(cacheKey); // Could leak across tenants!
}

// ❌ WRONG: DO ID without tenant encoding
function badDOAccess(sessionId: string, env: Env) {
  const id = env.SESSION_DO.idFromName(sessionId); // No tenant isolation!
  return env.SESSION_DO.get(id);
}
