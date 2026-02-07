# Testing Guide

This guide covers testing strategies, patterns, and best practices for the Crispy Enigma platform.

## Testing Philosophy

### Test Pyramid

```
           /\
          /  \       E2E Tests (few)
         /────\
        /      \     Integration Tests (some)
       /────────\
      /          \   Unit Tests (many)
     /────────────\
```

**Priority:**
1. **Unit tests** — Fast, isolated, many
2. **Integration tests** — Slower, real bindings, fewer
3. **E2E tests** — Slowest, full stack, minimal

### What to Test

✅ **Do test:**
- Tenant resolution logic
- Storage adapter isolation
- Request validation
- Error handling
- Business logic

❌ **Don't test:**
- Cloudflare primitives (assume they work)
- External AI models (use mocks)
- Third-party libraries

## Testing Stack

- **Vitest** — Test runner
- **Miniflare** — Local Cloudflare Workers emulation
- **Zod** — Schema validation

## Unit Tests

### Basic Unit Test

```typescript
import { describe, it, expect } from 'vitest';
import { resolveTenant } from '@repo/core/tenant';

describe('resolveTenant', () => {
  it('should resolve tenant from header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-tenant-id': 'demo' }
    });
    
    const tenant = resolveTenant(request, mockEnv);
    expect(tenant?.tenantId).toBe('demo');
  });

  it('should return null for missing tenant', () => {
    const request = new Request('http://localhost');
    const tenant = resolveTenant(request, mockEnv);
    expect(tenant).toBeNull();
  });

  it('should prioritize header over host', () => {
    const request = new Request('http://tenant-a.example.com', {
      headers: { 'x-tenant-id': 'tenant-b' }
    });
    
    const tenant = resolveTenant(request, mockEnv);
    expect(tenant?.tenantId).toBe('tenant-b');
  });
});
```

### Testing Tenant Isolation

```typescript
describe('KV adapter isolation', () => {
  it('should isolate tenant data', async () => {
    const mockKV = new Map<string, string>();
    const env = { CONFIG: createMockKV(mockKV) };

    await putKV('tenant-a', 'key', 'value-a', env);
    await putKV('tenant-b', 'key', 'value-b', env);

    const valueA = await getKV('tenant-a', 'key', env);
    const valueB = await getKV('tenant-b', 'key', env);

    expect(valueA).toBe('value-a');
    expect(valueB).toBe('value-b');
  });

  it('should not leak data across tenants', async () => {
    const mockKV = new Map<string, string>();
    const env = { CONFIG: createMockKV(mockKV) };

    await putKV('tenant-a', 'secret', 'sensitive-data', env);
    const leaked = await getKV('tenant-b', 'secret', env);

    expect(leaked).toBeNull();
  });
});
```

### Testing DO ID Encoding

```typescript
describe('Durable Object ID encoding', () => {
  it('should encode tenant in DO ID', () => {
    const id1 = getSessionDOId('tenant-a', 'session-1', env);
    const id2 = getSessionDOId('tenant-b', 'session-1', env);

    // Different tenants = different IDs
    expect(id1.toString()).not.toEqual(id2.toString());
  });

  it('should generate deterministic IDs', () => {
    const id1 = getSessionDOId('tenant-a', 'session-1', env);
    const id2 = getSessionDOId('tenant-a', 'session-1', env);

    // Same inputs = same ID
    expect(id1.toString()).toEqual(id2.toString());
  });
});
```

### Testing Request Validation

```typescript
import { z } from 'zod';

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  stream: z.boolean().optional().default(true),
});

describe('Chat request validation', () => {
  it('should accept valid request', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'Hello',
      stream: true
    };

    const result = ChatRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    const input = {
      sessionId: 'not-a-uuid',
      message: 'Hello'
    };

    const result = ChatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['sessionId']);
  });

  it('should reject empty message', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: ''
    };

    const result = ChatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject message too long', () => {
    const input = {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      message: 'x'.repeat(10001)
    };

    const result = ChatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
```

## Integration Tests

### Miniflare Setup

```typescript
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';

describe('Worker integration tests', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    const script = readFileSync('apps/worker-api/src/index.ts', 'utf-8');
    
    mf = new Miniflare({
      modules: true,
      script,
      bindings: {
        ENVIRONMENT: 'test'
      },
      kvNamespaces: ['CONFIG', 'CACHE', 'RATE_LIMITER'],
      durableObjects: {
        CHAT_SESSION: 'ChatSession',
        RATE_LIMITER_DO: 'RateLimiter'
      }
    });
  });

  afterAll(async () => {
    await mf.dispose();
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
    const data = await response.json();
    expect(data).toHaveProperty('response');
  });
});
```

### Testing Streaming Responses

```typescript
describe('Streaming chat', () => {
  it('should stream SSE events', async () => {
    const response = await mf.dispatchFetch('http://localhost/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'demo'
      },
      body: JSON.stringify({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Hello',
        stream: true
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let events = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          events.push(line.substring(7));
        }
      }
    }

    expect(events).toContain('token');
    expect(events).toContain('done');
  });
});
```

### Testing Rate Limiting

```typescript
describe('Rate limiting', () => {
  it('should enforce rate limits', async () => {
    const requests = [];
    
    // Send 101 requests (limit is 100/minute)
    for (let i = 0; i < 101; i++) {
      const promise = mf.dispatchFetch('http://localhost/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'demo'
        },
        body: JSON.stringify({
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          message: 'Hello'
        })
      });
      requests.push(promise);
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should include rate limit headers', async () => {
    const response = await mf.dispatchFetch('http://localhost/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'demo'
      },
      body: JSON.stringify({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        message: 'Hello'
      })
    });

    expect(response.headers.has('x-ratelimit-limit')).toBe(true);
    expect(response.headers.has('x-ratelimit-remaining')).toBe(true);
  });
});
```

### Testing Session Persistence

```typescript
describe('Session persistence', () => {
  it('should persist messages across requests', async () => {
    const sessionId = crypto.randomUUID();

    // First message
    await mf.dispatchFetch('http://localhost/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'demo'
      },
      body: JSON.stringify({
        sessionId,
        message: 'First message',
        stream: false
      })
    });

    // Second message
    await mf.dispatchFetch('http://localhost/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'demo'
      },
      body: JSON.stringify({
        sessionId,
        message: 'Second message',
        stream: false
      })
    });

    // Get history
    const historyResponse = await mf.dispatchFetch(
      `http://localhost/chat/${sessionId}/history`,
      {
        headers: { 'x-tenant-id': 'demo' }
      }
    );

    const history = await historyResponse.json();
    expect(history.messages.length).toBeGreaterThanOrEqual(4); // 2 user + 2 assistant
  });
});
```

## Mock Utilities

### Mock KV Namespace

```typescript
function createMockKV(storage = new Map<string, string>()): KVNamespace {
  return {
    async get(key: string): Promise<string | null> {
      return storage.get(key) || null;
    },
    async put(key: string, value: string): Promise<void> {
      storage.set(key, value);
    },
    async delete(key: string): Promise<void> {
      storage.delete(key);
    },
    async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }> {
      const keys = Array.from(storage.keys())
        .filter(k => !options?.prefix || k.startsWith(options.prefix))
        .map(name => ({ name }));
      return { keys };
    }
  } as unknown as KVNamespace;
}
```

### Mock Env

```typescript
function createMockEnv(): Env {
  return {
    AI: null as any,  // Mock as needed
    VECTORIZE: null as any,
    CONFIG: createMockKV(),
    CACHE: createMockKV(),
    RATE_LIMITER: createMockKV(),
    DB: null as any,
    CHAT_SESSION: null as any,
    RATE_LIMITER_DO: null as any,
    ENVIRONMENT: 'test'
  };
}
```

## Snapshot Testing

For complex outputs, use snapshot tests:

```typescript
import { expect, it } from 'vitest';

it('should generate correct prompt', () => {
  const prompt = assembleRAGPrompt({
    query: 'What is multi-tenancy?',
    context: ['Tenant isolation...', 'Storage scoping...'],
    citations: ['doc1', 'doc2']
  });

  expect(prompt).toMatchSnapshot();
});
```

## Test Organization

### File Naming

```
tests/
├── unit/
│   ├── tenant-resolution.test.ts
│   ├── kv-adapter.test.ts
│   └── validation.test.ts
├── integration/
│   ├── chat-endpoint.test.ts
│   ├── rate-limiting.test.ts
│   └── session-persistence.test.ts
└── fixtures/
    ├── tenants.ts
    └── messages.ts
```

### Test Structure

```typescript
describe('Feature name', () => {
  // Setup
  beforeEach(() => {
    // Per-test setup
  });

  // Teardown
  afterEach(() => {
    // Per-test cleanup
  });

  describe('Scenario 1', () => {
    it('should do X when Y', () => {
      // Arrange
      const input = createInput();

      // Act
      const result = doSomething(input);

      // Assert
      expect(result).toBe(expected);
    });
  });

  describe('Scenario 2', () => {
    // More tests
  });
});
```

## Coverage

Run tests with coverage:

```bash
npx vitest --coverage
```

**Target coverage:**
- **Unit tests:** >80%
- **Integration tests:** Critical paths covered
- **E2E tests:** Happy paths covered

## Testing Best Practices

### 1. Isolation

```typescript
// ✅ Good: Independent tests
it('test 1', () => {
  const state = createFreshState();
  // ...
});

it('test 2', () => {
  const state = createFreshState();
  // ...
});

// ❌ Bad: Shared state
let sharedState;
it('test 1', () => {
  sharedState = doSomething();
});
it('test 2', () => {
  doSomethingElse(sharedState);  // Depends on test 1
});
```

### 2. Descriptive Names

```typescript
// ✅ Good: Clear intent
it('should reject empty message', () => { /* ... */ });

// ❌ Bad: Vague
it('validation test', () => { /* ... */ });
```

### 3. Arrange-Act-Assert

```typescript
it('should calculate sum', () => {
  // Arrange
  const numbers = [1, 2, 3];

  // Act
  const sum = calculateSum(numbers);

  // Assert
  expect(sum).toBe(6);
});
```

### 4. Test One Thing

```typescript
// ✅ Good: Single responsibility
it('should validate UUID format', () => {
  expect(isValidUUID('not-a-uuid')).toBe(false);
});

it('should validate UUID length', () => {
  expect(isValidUUID('123')).toBe(false);
});

// ❌ Bad: Multiple concerns
it('should validate UUID', () => {
  expect(isValidUUID('not-a-uuid')).toBe(false);
  expect(isValidUUID('123')).toBe(false);
  expect(isValidUUID('')).toBe(false);
  // ... many assertions
});
```

### 5. Use Test Fixtures

```typescript
// fixtures/tenants.ts
export const mockTenants = {
  demo: {
    tenantId: 'demo',
    accountId: 'account-1',
    aiGatewayId: 'demo-gateway',
    // ...
  },
  acme: {
    tenantId: 'acme',
    accountId: 'account-2',
    aiGatewayId: 'acme-gateway',
    // ...
  }
};

// In tests
import { mockTenants } from '../fixtures/tenants';

it('should work with demo tenant', () => {
  const result = doWork(mockTenants.demo);
  // ...
});
```

## CI/CD Integration

Tests run automatically in CI:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npm test
      - run: npm run typecheck
```

## Next Steps

- **[Development Guide](Development-Guide.md)** — Development workflow
- **[Multi-Tenancy](Multi-Tenancy.md)** — Tenant patterns
- **[Security Best Practices](Security-Best-Practices.md)** — Security testing
- **[Troubleshooting](Troubleshooting.md)** — Debug test failures
