# Development Guide

This guide covers the development workflow, tooling, and best practices for working on the Crispy Enigma platform.

## Development Workflow

### 1. Initial Setup

```bash
# Clone repository
git clone https://github.com/rainbowkillah/crispy-enigma.git
cd crispy-enigma

# Install dependencies
npm install

# Verify installation
npm test
npm run typecheck
```

### 2. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make Changes

Follow the project patterns:
- **Explicit tenant parameters** in all functions
- **Gateway-first AI calls**
- **Tenant-scoped storage**
- **Zod validation** for all inputs

### 4. Write Tests

```bash
# Run tests in watch mode
npm run test:watch

# Run specific test file
npx vitest tests/your-test.test.ts
```

### 5. Verify Code Quality

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

### 6. Test Locally

```bash
# Start dev server
npm run dev -- --tenant=demo

# Test chat endpoint
npm run chat:dev -- --tenant=demo --message="Hello"

# Run smoke tests
npm run smoke:dev -- --tenant=demo
```

### 7. Commit and Push

```bash
git add .
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
```

## Project Structure

### Monorepo Layout

```
crispy-enigma/
├── apps/
│   └── worker-api/          # Main Worker application
│       ├── src/
│       │   ├── index.ts              # Entry point
│       │   ├── session-do.ts         # ChatSession DO
│       │   └── rate-limiter-do.ts    # RateLimiter DO
│       ├── project.json              # Nx targets
│       └── tsconfig.json
├── packages/
│   ├── core/                # Core types and utilities
│   │   ├── src/
│   │   │   ├── tenant/           # Tenant resolution
│   │   │   ├── http/             # Response helpers
│   │   │   ├── chat/             # Chat schemas
│   │   │   └── env.ts            # Env bindings type
│   │   └── project.json
│   ├── storage/             # Storage adapters
│   │   ├── src/
│   │   │   ├── kv.ts         # KV adapter
│   │   │   ├── do.ts         # DO helpers
│   │   │   └── vectorize.ts  # Vectorize adapter (M3)
│   │   └── project.json
│   ├── ai/                  # AI Gateway wrapper
│   │   ├── src/
│   │   │   └── gateway.ts    # Gateway client
│   │   └── project.json
│   ├── rag/                 # RAG pipeline (M3)
│   └── observability/       # Metrics & logging (M7)
├── tenants/                 # Per-tenant configs
│   ├── demo/
│   │   ├── tenant.config.json
│   │   └── wrangler.jsonc
│   └── index.ts             # Auto-generated
├── tests/                   # Unit & integration tests
├── scripts/                 # Dev tooling
│   ├── dev.mjs              # Dev server wrapper
│   ├── chat-dev.mjs         # Chat CLI
│   ├── smoke-dev.mjs        # Smoke tests
│   └── generate-tenant-index.mjs
└── docs/                    # Documentation
```

## Development Tools

### npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev -- --tenant=<name>` | Start local dev server |
| `npm run chat:dev -- --tenant=<name> --message="..."` | Test chat endpoint |
| `npm run smoke:dev -- --tenant=<name>` | Run smoke tests |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | TypeScript compilation check |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run tenants:generate` | Regenerate tenant index |

### Wrangler Commands

```bash
# Start dev server (via npm script)
wrangler dev --config tenants/demo/wrangler.jsonc

# Deploy to production
wrangler deploy --config tenants/demo/wrangler.jsonc

# Tail logs
wrangler tail

# Manage secrets
wrangler secret put API_KEY
wrangler secret list
```

### Nx Commands

```bash
# Run target for specific package
npx nx test @repo/core
npx nx typecheck @repo/storage

# Run target for all packages
npx nx run-many -t test

# Show dependency graph
npx nx graph
```

## Code Patterns

### 1. Tenant Resolution

Always resolve tenant before any business logic:

```typescript
import { withTenant } from '@repo/core/tenant';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withTenant(request, env, handleRequest);
  }
};

async function handleRequest(
  tenant: TenantContext,
  request: Request,
  env: Env
): Promise<Response> {
  // tenant is guaranteed to be valid here
}
```

### 2. Storage Adapters

Use explicit tenant parameters:

```typescript
import { getKV, putKV } from '@repo/storage/kv';

// ✅ Correct
const value = await getKV(tenant.tenantId, 'config-key', env);
await putKV(tenant.tenantId, 'config-key', 'value', env);

// ❌ Wrong - no tenant parameter
const value = await env.CONFIG.get('config-key');
```

### 3. AI Gateway

Always route through gateway:

```typescript
import { generateChat } from '@repo/ai/gateway';

// ✅ Correct
const stream = await generateChat(
  tenant.tenantId,
  messages,
  { model: tenant.aiModels.chat, stream: true },
  env
);

// ❌ Wrong - direct Workers AI call
const stream = await env.AI.run(model, { messages, stream: true });
```

### 4. Request Validation

Use Zod schemas:

```typescript
import { z } from 'zod';

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  stream: z.boolean().optional().default(true),
});

// In handler
const body = await request.json();
const validated = ChatRequestSchema.parse(body);  // Throws on invalid
```

### 5. Error Handling

Use response helpers:

```typescript
import { ok, fail } from '@repo/core/http/response';

// Success
return ok({ message: 'Success' }, requestId);

// Error
return fail(400, 'Invalid request', requestId);

// With headers
return fail(429, 'Rate limit exceeded', requestId, {
  'Retry-After': '60',
  'X-RateLimit-Limit': '100'
});
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { resolveTenant } from '@repo/core/tenant';

describe('resolveTenant', () => {
  it('should resolve tenant from header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-tenant-id': 'demo' }
    });
    
    const tenant = resolveTenant(request, env);
    expect(tenant?.tenantId).toBe('demo');
  });

  it('should return null for missing tenant', () => {
    const request = new Request('http://localhost');
    const tenant = resolveTenant(request, env);
    expect(tenant).toBeNull();
  });
});
```

### Integration Tests with Miniflare

```typescript
import { beforeAll, describe, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';

describe('Chat endpoint (integration)', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    mf = new Miniflare({
      script: `
        export default {
          async fetch(request, env) {
            // Your worker code
          }
        }
      `,
      bindings: {
        // Mock bindings
      }
    });
  });

  it('should handle chat request', async () => {
    const response = await mf.dispatchFetch('http://localhost/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'demo'
      },
      body: JSON.stringify({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Hello',
        stream: false
      })
    });

    expect(response.status).toBe(200);
  });
});
```

### Smoke Tests

```bash
# Run smoke tests against local dev server
npm run smoke:dev -- --tenant=demo
```

## Debugging

### Local Debugging

```typescript
// Add console.log (appears in wrangler dev output)
console.log('Debug:', { tenantId, sessionId });

// Use debugger statement (with --inspect flag)
debugger;
```

### Wrangler Dev with Inspector

```bash
wrangler dev --config tenants/demo/wrangler.jsonc --inspector
```

Then open `chrome://inspect` in Chrome.

### Miniflare Debugging

```typescript
import { Miniflare } from 'miniflare';

const mf = new Miniflare({
  script: '...',
  verbose: true,  // Enable verbose logging
  bindings: { /* ... */ }
});
```

## Common Tasks

### Add a New Endpoint

1. **Add route handler** in `apps/worker-api/src/index.ts`:

```typescript
if (pathname === '/new-endpoint' && method === 'POST') {
  return handleNewEndpoint(tenant, request, env);
}
```

2. **Create handler function**:

```typescript
async function handleNewEndpoint(
  tenant: TenantContext,
  request: Request,
  env: Env
): Promise<Response> {
  // Implementation
}
```

3. **Add Zod schema** in `packages/core/src/schemas/`:

```typescript
export const NewEndpointRequestSchema = z.object({
  // fields
});
```

4. **Write tests** in `tests/`:

```typescript
describe('New endpoint', () => {
  it('should handle request', async () => {
    // Test
  });
});
```

### Add a New Storage Adapter

1. **Create adapter** in `packages/storage/src/`:

```typescript
export async function getResource(
  tenantId: string,
  resourceId: string,
  env: Env
): Promise<Resource | null> {
  const key = `${tenantId}:resources:${resourceId}`;
  const value = await env.KV.get(key);
  return value ? JSON.parse(value) : null;
}
```

2. **Export from barrel**:

```typescript
// packages/storage/src/index.ts
export * from './resource';
```

3. **Write tests**:

```typescript
describe('Resource adapter', () => {
  it('should scope by tenant', async () => {
    await putResource('tenant-a', 'res-1', data, env);
    const resource = await getResource('tenant-b', 'res-1', env);
    expect(resource).toBeNull();  // Different tenant
  });
});
```

### Add a New Tenant

1. **Create tenant directory**:

```bash
mkdir -p tenants/new-tenant
```

2. **Create `tenant.config.json`**:

```json
{
  "tenantId": "new-tenant",
  "accountId": "your-account-id",
  "aiGatewayId": "new-tenant-gateway",
  "aiModels": {
    "chat": "@cf/meta/llama-3.1-8b-instruct",
    "embeddings": "@cf/baai/bge-base-en-v1.5"
  },
  "vectorizeNamespace": "new-tenant-embeddings",
  "rateLimit": { "perMinute": 100, "burst": 20 }
}
```

3. **Create `wrangler.jsonc`** (copy from demo tenant and update IDs)

4. **Regenerate tenant index**:

```bash
npm run tenants:generate
```

5. **Test**:

```bash
npm run dev -- --tenant=new-tenant
```

## Best Practices

### 1. Follow TypeScript Patterns

```typescript
// ✅ Explicit types
function processData(tenantId: string, data: Data, env: Env): Result {
  // ...
}

// ❌ Implicit any
function processData(tenantId, data, env) {
  // ...
}
```

### 2. Use Zod for Validation

```typescript
// ✅ Runtime validation
const parsed = schema.parse(input);

// ❌ TypeScript-only validation
const data = input as MyType;
```

### 3. Tenant-First Function Signatures

```typescript
// ✅ Tenant as first parameter
function doWork(tenantId: string, workData: Data): Result;

// ❌ Hidden tenant
function doWork(workData: Data): Result;
```

### 4. Write Tests Early

Write tests alongside features, not after. Use TDD when appropriate.

### 5. Keep Changes Minimal

Follow the "surgical changes" principle:
- Change as few lines as possible
- Don't refactor unrelated code
- Focus on the task at hand

## Code Style

### TypeScript

- ES2022+ features
- `export default { fetch }` pattern for Workers
- Explicit return types for public functions
- No `any` types (use `unknown` instead)

### Formatting

Handled by Prettier:
```bash
npm run format
```

### Linting

Handled by ESLint:
```bash
npm run lint
```

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
npm run dev -- --tenant=demo --port=8788
```

**Binding errors:**
- Check `wrangler.jsonc` configuration
- Ensure Miniflare is up to date
- Verify binding names match `Env` interface

**Test failures:**
- Check that tests don't share state
- Verify mock bindings are configured
- Use `it.only()` to isolate failing test

See **[Troubleshooting](Troubleshooting.md)** for more solutions.

## Next Steps

- **[Testing Guide](Testing-Guide.md)** — Testing patterns
- **[Multi-Tenancy](Multi-Tenancy.md)** — Tenant isolation
- **[Security Best Practices](Security-Best-Practices.md)** — Security guidelines
- **[API Reference](API-Reference.md)** — Endpoint docs
