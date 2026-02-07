# Troubleshooting

Common issues and solutions for the Crispy Enigma platform.

## Installation Issues

### npm install fails

**Symptoms:**
```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Wrong Node version

**Symptoms:**
```
error @cloudflare/workers-types@4.20240215.0: The engine "node" is incompatible
```

**Solution:**
```bash
# Check Node version
node --version  # Should be 18+ (recommend 20+)

# Use nvm to switch versions
nvm use 20
nvm alias default 20
```

## Development Server Issues

### Port already in use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::8787
```

**Solution 1: Use different port**
```bash
npm run dev -- --tenant=demo --port=8788
```

**Solution 2: Kill existing process**
```bash
# macOS/Linux
lsof -ti:8787 | xargs kill -9

# Windows
netstat -ano | findstr :8787
taskkill /PID <PID> /F
```

### Tenant not found

**Symptoms:**
```
Error: Tenant 'demo' not found
```

**Solution:**
```bash
# Check tenant exists
ls tenants/

# Regenerate tenant index
npm run tenants:generate

# Verify tenant config is valid JSON
cat tenants/demo/tenant.config.json | jq .
```

### Binding errors

**Symptoms:**
```
Error: Cannot find binding 'CONFIG'
```

**Solution:**

1. Check `wrangler.jsonc` has the binding:
```jsonc
{
  "kv_namespaces": [
    { "binding": "CONFIG", "id": "..." }
  ]
}
```

2. Check `Env` interface includes it:
```typescript
// packages/core/src/env.ts
export interface Env {
  CONFIG: KVNamespace;  // Must match binding name
  // ...
}
```

3. Restart dev server:
```bash
# Kill and restart
npm run dev -- --tenant=demo
```

### Miniflare version mismatch

**Symptoms:**
```
Error: Miniflare version mismatch
```

**Solution:**
```bash
# Update Miniflare
npm install miniflare@latest --save-dev

# Clear cache
rm -rf node_modules/.cache
```

## Runtime Errors

### Tenant resolution fails

**Symptoms:**
```json
{
  "error": "Tenant required",
  "requestId": "..."
}
```

**Solution:**

Make sure you include tenant identifier:

```bash
# Option 1: Header
curl -H "x-tenant-id: demo" http://localhost:8787/health

# Option 2: Host (if configured)
curl -H "Host: demo.example.com" http://localhost:8787/health

# Option 3: API key (if configured)
curl -H "x-api-key: your-api-key" http://localhost:8787/health
```

### DO binding not found

**Symptoms:**
```
Error: No such binding: CHAT_SESSION
```

**Solution:**

1. Check DO is defined in `wrangler.jsonc`:
```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "CHAT_SESSION",
        "class_name": "ChatSession",
        "script_name": "worker-api-demo"
      }
    ]
  }
}
```

2. Check DO class is exported:
```typescript
// apps/worker-api/src/session-do.ts
export class ChatSession implements DurableObject {
  // ...
}

// apps/worker-api/src/index.ts
export { ChatSession } from './session-do';
```

3. Restart dev server with fresh state:
```bash
rm -rf .wrangler
npm run dev -- --tenant=demo
```

### Rate limit always triggers

**Symptoms:**
```json
{
  "error": "Rate limit exceeded",
  "requestId": "..."
}
```

**Solution:**

1. Check rate limit config:
```json
// tenants/demo/tenant.config.json
{
  "rateLimit": {
    "perMinute": 100,  // Increase this
    "burst": 20
  }
}
```

2. Clear rate limiter state (dev only):
```bash
# Stop dev server
# Delete .wrangler/state directory
rm -rf .wrangler/state
# Restart dev server
npm run dev -- --tenant=demo
```

### Streaming not working

**Symptoms:**
- Response buffered instead of streaming
- No SSE events received

**Solution:**

1. Check `stream: true` in request:
```json
{
  "sessionId": "...",
  "message": "Hello",
  "stream": true  // Must be true
}
```

2. Check response headers:
```typescript
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',  // Required
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  }
});
```

3. Check client handles SSE properly:
```javascript
const eventSource = new EventSource('/chat');
eventSource.addEventListener('token', (event) => {
  const data = JSON.parse(event.data);
  console.log(data.token);
});
```

## Test Failures

### Tests timeout

**Symptoms:**
```
Test timed out after 5000ms
```

**Solution:**

1. Increase timeout:
```typescript
it('slow test', async () => {
  // ...
}, 10000);  // 10 second timeout
```

2. Check for hanging promises:
```typescript
// ❌ Bad: Forgot to await
it('test', async () => {
  doAsyncWork();  // Not awaited!
});

// ✅ Good: Properly awaited
it('test', async () => {
  await doAsyncWork();
});
```

### Mock binding errors

**Symptoms:**
```
TypeError: Cannot read property 'get' of undefined
```

**Solution:**

Make sure all bindings are mocked:
```typescript
const mockEnv = {
  CONFIG: createMockKV(),
  CACHE: createMockKV(),
  RATE_LIMITER: createMockKV(),
  CHAT_SESSION: createMockDO(),
  RATE_LIMITER_DO: createMockDO(),
  AI: createMockAI(),
  VECTORIZE: createMockVectorize(),
  DB: createMockD1()
};
```

### Snapshot mismatch

**Symptoms:**
```
Snapshot mismatch: expected value to match snapshot
```

**Solution:**

1. Review diff carefully
2. If intentional change, update snapshot:
```bash
npx vitest -u
```

3. Commit updated snapshot:
```bash
git add tests/__snapshots__/
git commit -m "Update snapshots"
```

## TypeScript Errors

### Type errors in Env

**Symptoms:**
```
Property 'NEW_BINDING' does not exist on type 'Env'
```

**Solution:**

Add binding to `Env` interface:
```typescript
// packages/core/src/env.ts
export interface Env {
  NEW_BINDING: KVNamespace;  // Add this
  // ... existing bindings
}
```

### Cannot find module

**Symptoms:**
```
Cannot find module '@repo/core/tenant'
```

**Solution:**

1. Check path alias in `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@repo/core/*": ["packages/core/src/*"]
    }
  }
}
```

2. Rebuild:
```bash
npm run typecheck
```

### Circular dependency

**Symptoms:**
```
Warning: Circular dependency detected
```

**Solution:**

Refactor to break cycle:
```typescript
// ❌ Bad: A imports B, B imports A
// a.ts
import { B } from './b';

// b.ts
import { A } from './a';

// ✅ Good: Extract shared code to C
// a.ts
import { C } from './c';

// b.ts
import { C } from './c';

// c.ts
export const C = { /* shared code */ };
```

## Build Errors

### Wrangler build fails

**Symptoms:**
```
Error: Failed to build worker
```

**Solution:**

1. Check for syntax errors:
```bash
npm run typecheck
```

2. Check for import errors:
```bash
npm run lint
```

3. Clear build cache:
```bash
rm -rf .wrangler dist
npm run dev -- --tenant=demo
```

### Module format errors

**Symptoms:**
```
Error: ES module format required
```

**Solution:**

Ensure `package.json` has:
```json
{
  "type": "module"
}
```

And `wrangler.jsonc` uses:
```jsonc
{
  "main": "src/index.ts"  // Not dist/index.js
}
```

## Deployment Issues

### Wrangler authentication fails

**Symptoms:**
```
Error: Not logged in to Cloudflare
```

**Solution:**
```bash
# Login to Cloudflare
wrangler login

# Or use API token
export CLOUDFLARE_API_TOKEN=your-token
wrangler deploy
```

### Binding not found in production

**Symptoms:**
```
Error: Binding 'CONFIG' not found
```

**Solution:**

1. Create KV namespace:
```bash
wrangler kv:namespace create CONFIG
```

2. Update `wrangler.jsonc` with namespace ID:
```jsonc
{
  "kv_namespaces": [
    {
      "binding": "CONFIG",
      "id": "abc123..."  // From wrangler kv:namespace create
    }
  ]
}
```

3. Deploy:
```bash
wrangler deploy --config tenants/demo/wrangler.jsonc
```

### Migration errors (DO)

**Symptoms:**
```
Error: Migration tag mismatch
```

**Solution:**

1. Check migration tag in `wrangler.jsonc`:
```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "CHAT_SESSION",
        "class_name": "ChatSession",
        "script_name": "worker-api-demo"
      }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_classes": ["ChatSession", "RateLimiter"] }
  ]
}
```

2. For new migrations:
```jsonc
{
  "migrations": [
    { "tag": "v1", "new_classes": ["ChatSession", "RateLimiter"] },
    { "tag": "v2", "new_classes": ["NewDO"] }
  ]
}
```

## Performance Issues

### Slow responses

**Symptoms:**
- API responses > 1 second
- Chat streaming delayed

**Debug steps:**

1. Add timing logs:
```typescript
const start = Date.now();

// ... do work

console.log(`Operation took ${Date.now() - start}ms`);
```

2. Check for N+1 queries:
```typescript
// ❌ Bad: N+1 queries
for (const item of items) {
  await env.KV.get(`${tenantId}:${item.id}`);
}

// ✅ Good: Batch requests
const keys = items.map(item => `${tenantId}:${item.id}`);
const values = await Promise.all(
  keys.map(key => env.KV.get(key))
);
```

3. Check DO contention:
```typescript
// Use separate DO bindings for different use cases
const session = env.CHAT_SESSION.get(sessionId);  // Session state
const rateLimit = env.RATE_LIMITER_DO.get(userId);  // Rate limiting
```

### High memory usage

**Symptoms:**
```
Error: Memory limit exceeded
```

**Solution:**

1. Don't buffer streams:
```typescript
// ❌ Bad: Buffers entire response
const text = await response.text();
return new Response(text);

// ✅ Good: Stream directly
return new Response(response.body);
```

2. Limit array sizes:
```typescript
const messages = await session.getMessages();
const recent = messages.slice(-100);  // Last 100 only
```

## Data Issues

### Session not persisting

**Symptoms:**
- Messages not saved
- History API returns empty

**Solution:**

1. Check session ID is consistent:
```typescript
// Generate once, reuse for all requests
const sessionId = crypto.randomUUID();
```

2. Check DO is writing:
```typescript
// In session DO
async appendMessage(message: Message) {
  const messages = await this.state.storage.get<Message[]>('messages') || [];
  messages.push(message);
  await this.state.storage.put('messages', messages);  // Must await!
}
```

3. Check DO ID encoding:
```typescript
// Must include tenant
const id = env.CHAT_SESSION.idFromName(`${tenantId}:${sessionId}`);
```

### Cache not working

**Symptoms:**
- Every request hits AI Gateway
- Cache keys not found

**Solution:**

1. Check TTL:
```typescript
await putCache(tenantId, key, value, 3600, env);  // 1 hour
//                                     ^^^^^ Must set TTL
```

2. Check cache key format:
```typescript
// Must include tenant
const cacheKey = `${tenantId}:cache:${computeHash(query)}`;
```

3. Verify KV namespace:
```typescript
// Use CACHE binding, not CONFIG
await env.CACHE.put(key, value, { expirationTtl: ttl });
```

## Getting More Help

### Enable Verbose Logging

```typescript
console.log('Debug info', {
  tenantId,
  sessionId,
  messageLength: message.length,
  timestamp: Date.now()
});
```

### Wrangler Tail

View live logs:
```bash
wrangler tail --config tenants/demo/wrangler.jsonc
```

### Check Cloudflare Dashboard

1. Go to Cloudflare Dashboard
2. Select your account
3. Navigate to Workers & Pages
4. Select your worker
5. View logs, analytics, and errors

### GitHub Issues

Search existing issues:
https://github.com/rainbowkillah/crispy-enigma/issues

### Documentation

- **[Getting Started](Getting-Started.md)** — Setup guide
- **[Development Guide](Development-Guide.md)** — Development workflow
- **[Multi-Tenancy](Multi-Tenancy.md)** — Tenant patterns
- **[Testing Guide](Testing-Guide.md)** — Testing strategies
- **[Security Best Practices](Security-Best-Practices.md)** — Security guidelines
