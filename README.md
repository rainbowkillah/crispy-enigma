# crispy-enigma

**Multi-tenant Cloudflare Workers AI monorepo** with streaming chat, RAG search, tool execution, and per-tenant deployments.

**Current status:** M1 complete (streaming chat, sessions, rate limiting, KV cache, tests).

## Quick Start

```bash
# Install dependencies
npm install

# Run local dev for a tenant (once M0 scaffolding complete)
npm run dev -- --tenant=<tenant-name>

# Call the /chat endpoint (non-streaming by default)
npm run chat:dev -- --tenant=<tenant-name> --message="Hello"

# Run tests
npm test
```

## Architecture

Request flow: `apps/worker-api` → **tenant resolution** → policy checks → AI Gateway → Workers AI → DO/KV/Vectorize → streaming response.

Key endpoints:
- `POST /chat`
- `GET /chat/:sessionId/history`
- `DELETE /chat/:sessionId`

See [docs/plan.md](docs/plan.md) for full architecture and milestones.
See [docs/milestones/M1.md](docs/milestones/M1.md) for the M1 summary.
See [docs/streaming.md](docs/streaming.md), [docs/sessions.md](docs/sessions.md), and [docs/rate-limiting.md](docs/rate-limiting.md) for the M1 contracts.
See [docs/examples/chat.md](docs/examples/chat.md) for local /chat examples.
See [docs/wrangler.md](docs/wrangler.md) for the Wrangler version pin and ESM module format decision.

## Critical Patterns

### ✅ Tenant Resolution First

```typescript
// CORRECT: Resolve tenant before any storage/AI access
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // hostMap/apiKeyMap built from tenant configs at startup
    const tenant = resolveTenant(request, { hostMap, apiKeyMap });
    if (!tenant) return new Response('Tenant required', { status: 400 });

    const config = tenantIndex.byId[tenant.tenantId];
    if (!config) return new Response('Unknown tenant', { status: 404 });

    return handleRequest(config, request, env);
  }
};
```

```typescript
// WRONG: Direct storage access without tenant context
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const value = await env.CONFIG.get('some-key'); // ❌ No tenant scoping!
    return new Response(value);
  }
};
```

### ✅ Explicit Tenant Parameters

```typescript
// CORRECT: tenantId required in method signature
interface KVAdapter {
  get(tenantId: string, key: string): Promise<string | null>;
  put(tenantId: string, key: string, value: string): Promise<void>;
}
```

```typescript
// WRONG: Hidden tenant context
class KVAdapter {
  constructor(private tenantId: string) {} // ❌ Hidden boundary!
  
  async get(key: string) { /* ... */ }
}
```

### ⚠️ Common Footguns

1. **KV keys without prefixing**: Always prefix with `tenantId:` or use dedicated namespaces
2. **DO IDs without tenant encoding**: Must include tenant in ID generation
3. **Shared Vectorize index without metadata filtering**: Enforce `tenantId` in all queries
4. **Direct Workers AI calls**: Always route through AI Gateway wrapper
5. **Caching without tenant awareness**: Cache keys must include tenant context

## Project Structure

```
apps/
  worker-api/          # Main API (chat, search, tools, ingest)
packages/
  core/                # Tenant resolution, types, errors
  storage/             # KV/DO/Vectorize adapters (tenant-scoped)
  ai/                  # AI Gateway wrapper
  rag/                 # Chunking, retrieval, prompt assembly
  observability/       # Metrics, logging
tenants/
  <tenant-name>/
    tenant.config.json # Tenant-specific config
    wrangler.jsonc     # Cloudflare bindings
```

## Milestones

- **M0**: Foundation + tenant resolution
- **M1**: Streaming chat + sessions (DO) ✅
- **M2**: AI Gateway integration
- **M3**: Embeddings + Vectorize + RAG
- **M4**: AI Search endpoint
- **M5**: Tool/function execution
- **M6**: TTS adapter interface
- **M7**: Observability + metrics
- **M8**: Deployment automation

See [docs/plan.md](docs/plan.md) for detailed breakdown.

## Security Defaults

- **No secrets in repo**: Use `wrangler secret put` or environment vars
- **Strict input validation**: Zod schemas for all endpoints
- **Tenant-scoped CORS**: Configure per tenant in `tenant.config.json`
- **Rate limiting**: DO-based per tenant + per user/IP
- **No PII logging**: Redact sensitive data in structured logs
