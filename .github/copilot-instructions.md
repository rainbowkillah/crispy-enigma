# Project Guidelines

## Code Style
- **TypeScript for Cloudflare Workers**: Target ES2022+, use `export default { fetch }` pattern
- **Explicit tenant parameters**: Every storage/AI method MUST require `tenantId: string` as first parameter
- **No tenant context hiding**: Avoid classes/closures that capture tenant context; pass explicitly

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

## Architecture

**Request lifecycle** (enforce in this order):
1. **Tenant resolution** (`resolveTenant(request, env)`) - MUST run first
2. **Policy checks** (rate limits, CORS, feature flags)
3. **Route handler** (chat, search, tools)
4. **AI Gateway calls** (never direct Workers AI)
5. **Storage operations** (always tenant-scoped)
6. **Response** (streaming or JSON)

**Package boundaries**:
- `packages/core`: Tenant types (`TenantContext`), resolution middleware, errors
- `packages/storage`: Adapters with **explicit** `tenantId` parameters
- `packages/ai`: AI Gateway wrapper (enforces tenant routing)
- `packages/rag`: Chunking, retrieval, prompt assembly
- `packages/observability`: Structured logging with required tenant field

## Build and Test

```bash
# M0 is complete! Use npm (not pnpm):
npm install
npm test
npm run typecheck
npm run dev -- --tenant=<name>  # wrangler dev with tenant config
npm run smoke:dev -- --tenant=<name>  # smoke tests
```

## Project Status

**Current Milestone:** M2 ✅ COMPLETE | M3 🔵 NEXT

- **M0 (Foundation):** ✅ Complete
- **M1 (Chat + Sessions):** ✅ Complete
- **M2 (AI Gateway Integration):** ✅ Complete
- See [docs/PROJECT-STATUS.md](../docs/PROJECT-STATUS.md) for full status
- See [docs/milestones/M2.md](../docs/milestones/M2.md) for the M2 summary

## Project Conventions

### Tenant Resolution (CRITICAL)

**Rule**: Reject ALL requests that don't resolve a tenant. No fallbacks, no defaults.

```typescript
// Middleware pattern - use this in all Workers
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

### Storage Scoping Patterns

**KV keys**: Always prefix with tenant
```typescript
// ✅ Correct
const key = `${tenantId}:feature-flags:${flagName}`;
const value = await env.KV.get(key);

// ❌ Wrong - no tenant prefix
const value = await env.KV.get(flagName);
```

**DO IDs**: Encode tenant in ID
```typescript
// ✅ Correct
const doId = env.CHAT_SESSION.idFromName(`${tenantId}:${sessionId}`);

// ❌ Wrong - tenant not encoded
const doId = env.SESSION_DO.idFromName(sessionId);
```

**Vectorize**: Use per-tenant index OR metadata filter
```typescript
// ✅ Option 1: Per-tenant index (preferred)
const indexName = `${tenantId}-embeddings`;
const results = await env.VECTORIZE.query(vector, { namespace: indexName });

// ✅ Option 2: Shared index with metadata filter
const results = await env.VECTORIZE.query(vector, {
  filter: { tenantId: { $eq: tenantId } }
});

// ❌ Wrong - no tenant isolation
const results = await env.VECTORIZE.query(vector);
```

### AI Gateway (MANDATORY)

**Rule**: ALL Workers AI calls MUST route through AI Gateway wrapper.

```typescript
// ✅ Correct
import { generateChat } from '@repo/ai/gateway';
const response = await generateChat(tenantId, messages, { model: tenant.aiModels.chat }, env);

// ❌ Wrong - direct Workers AI call
const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', { messages });
```

### Type Safety

**Env typings**: Single source of truth in `packages/core/src/env.ts`
```typescript
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
}
```

## Integration Points

**Cloudflare bindings** (defined in `wrangler.jsonc`):
- `[[vectorize]]`: Per-tenant index OR shared with metadata
- `[[kv_namespaces]]`: Shared namespace (use key prefixing)
- `[[durable_objects]]`: Shared class (encode tenant in ID)
- `[ai]`: Workers AI binding (route via gateway)

**Tenant config** (`tenants/<tenant>/tenant.config.json`):
```json
{
  "tenantId": "acme-corp",
  "accountId": "cf-account-id",
  "aiGatewayId": "acme-gateway",
  "aiModels": {
    "chat": "@cf/meta/llama-2-7b-chat-int8",
    "embeddings": "@cf/baai/bge-m3"
  },
  "vectorizeNamespace": "acme-embeddings",
  "rateLimit": { "perMinute": 100, "burst": 20 }
}
```

## Security

**Secrets**: Use `wrangler secret put <KEY>` or environment variables. NEVER commit:
- API keys
- Auth tokens  
- Tenant credentials
- Encryption keys

**Input validation**: Use Zod schemas for ALL endpoints
```typescript
import { z } from 'zod';

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  stream: z.boolean().optional().default(true),
});

// In handler:
const body = await request.json();
const validated = ChatRequestSchema.parse(body); // Throws on invalid input
```

**Logging**: Redact sensitive data
```typescript
// ✅ Safe logging
logger.info('Chat request', {
  tenantId: tenant.tenantId,
  sessionId: 'sess_xxx...', // Truncated
  messageLength: message.length,
  // ❌ Do NOT log: message content, tokens, user PII
});
```

## Common Footguns

1. **Forgetting tenant resolution**: Always check tenant exists before storage/AI
2. **Caching without tenant**: Cache keys must include `tenantId`
3. **DO contention**: Don't create global DO instances; scope per tenant+resource
4. **Vectorize metadata limits**: Keep metadata <1KB per vector
5. **KV consistency**: Eventual consistency means flag changes take ~60s to propagate
6. **Streaming broken by buffering**: Use `TransformStream` for proper backpressure

---
## M8 Copilot Instructions

**Objective:** Create a pull request, perform a code review, and create a handoff document to prepare for Codex to work on M8.

### Steps:

1.  **Create a Pull Request:**
    - Create a new branch for the M8 work.
    - Implement the features and bug fixes planned for M8.
    - Push the changes to the remote repository.
    - Open a pull request against the main branch.

2.  **Perform Code Review:**
    - Review the pull request for code quality, correctness, and adherence to project standards.
    - Provide feedback and suggestions for improvement.
    - Approve the pull request once it meets the quality standards.

3.  **Create Handoff Document:**
    - Create a new handoff document for M8, similar to the M6-M7 handoff.
    - Summarize the work completed in M8.
    - Outline the plan for the next milestone.

4.  **Prepare for Codex:**
    - Update the  file with new prompts for the next milestone.
    - Ensure that the prompts are clear, concise, and provide enough context for Codex to generate the required code.

