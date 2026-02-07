# Security Best Practices

This document outlines security patterns, guidelines, and best practices for the Crispy Enigma platform.

## Security Principles

### 1. Fail Closed

**Reject requests on any validation failure.** Never fall back to defaults or permissive modes.

```typescript
// ✅ Good: Reject on missing tenant
const tenant = await resolveTenant(request, env);
if (!tenant) {
  return fail(400, 'Tenant required', requestId);
}

// ❌ Bad: Default to shared tenant
const tenant = await resolveTenant(request, env) || { tenantId: 'shared' };
```

### 2. Defense in Depth

**Layer security controls:**
- Input validation (Zod schemas)
- Tenant isolation (storage scoping)
- Rate limiting (DO-based)
- Audit logging (all mutations)
- Secrets management (Wrangler secrets)

### 3. Least Privilege

**Grant minimal necessary access:**
- Tenant-scoped storage keys
- DO IDs encode tenant
- Gateway metadata limits attribution
- Feature flags control access

## Tenant Isolation Security

### Storage Isolation

**Rule:** All storage MUST be tenant-scoped.

```typescript
// ✅ Secure: Tenant-scoped
const key = `${tenantId}:resource:${resourceId}`;
const value = await env.KV.get(key);

// ❌ Vulnerable: No tenant scope
const value = await env.KV.get(resourceId);  // Cross-tenant leak!
```

### DO ID Security

**Rule:** Encode tenant in DO IDs.

```typescript
// ✅ Secure: Tenant in ID
const id = env.CHAT_SESSION.idFromName(`${tenantId}:${sessionId}`);

// ❌ Vulnerable: No tenant in ID
const id = env.CHAT_SESSION.idFromName(sessionId);  // Can access other tenants!
```

### Vectorize Isolation

**Rule:** Use namespace parameter for queries.

```typescript
// ✅ Secure: Namespace isolation
const results = await env.VECTORIZE.query(embedding, {
  namespace: tenantId,
  topK: 20
});

// ❌ Vulnerable: No namespace
const results = await env.VECTORIZE.query(embedding, { topK: 20 });
```

### Attack Scenario: Cross-Tenant Access

**Without proper isolation:**

1. Attacker discovers session ID format: `uuid`
2. Attacker creates session: `123e4567-e89b-12d3-a456-426614174000`
3. Attacker guesses another session ID: `123e4567-e89b-12d3-a456-426614174001`
4. Without tenant encoding in DO ID, attacker accesses victim's session

**With proper isolation:**

1. Session IDs include tenant: `tenant-a:123e4567-...`
2. DO ID: `env.CHAT_SESSION.idFromName('tenant-a:123e4567-...')`
3. Attacker with `tenant-b` cannot access `tenant-a` sessions
4. Cross-tenant access prevented at DO layer

## Input Validation

### Zod Schemas

**Rule:** ALL endpoints MUST validate input with Zod.

```typescript
import { z } from 'zod';

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  stream: z.boolean().optional().default(true),
});

// In handler
async function handleChat(tenant: TenantContext, request: Request, env: Env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Invalid JSON', requestId);
  }

  const validated = ChatRequestSchema.safeParse(body);
  if (!validated.success) {
    return fail(400, 'Validation error', requestId, {
      errors: validated.error.issues
    });
  }

  const { sessionId, message, stream } = validated.data;
  // ... proceed with validated data
}
```

### Common Validation Patterns

```typescript
// UUIDs
z.string().uuid()

// Email
z.string().email()

// URL
z.string().url()

// Enum
z.enum(['option1', 'option2', 'option3'])

// String with constraints
z.string().min(1).max(1000).trim()

// Positive integer
z.number().int().positive()

// ISO timestamp
z.string().datetime()

// Custom validation
z.string().refine(
  (val) => val.startsWith('tenant-'),
  { message: 'Must start with tenant-' }
)
```

### Sanitization

```typescript
// Always trim strings
const message = validated.data.message.trim();

// Remove null bytes
const clean = input.replace(/\0/g, '');

// Limit nesting depth for JSON
const schema = z.object({
  data: z.record(z.unknown()).refine(
    (obj) => getDepth(obj) <= 5,
    { message: 'Max nesting depth exceeded' }
  )
});
```

## Secrets Management

### Never Commit Secrets

**Rule:** NEVER commit secrets to the repository.

```typescript
// ❌ NEVER do this
const API_KEY = 'sk-1234567890abcdef';

// ✅ Use Wrangler secrets
wrangler secret put API_KEY
```

### Secret Types

**Should be secrets:**
- API keys
- Auth tokens
- Encryption keys
- Database passwords
- OAuth client secrets

**Can be in config:**
- Tenant IDs
- Public model names
- Non-sensitive URLs
- Feature flags (non-security)

### Using Secrets

```typescript
// Secrets are available in Env
export interface Env {
  API_KEY?: string;  // Secret
  OAUTH_CLIENT_SECRET?: string;  // Secret
  // ... other bindings
}

// Access in Worker
const apiKey = env.API_KEY;
if (!apiKey) {
  throw new Error('API_KEY not configured');
}
```

### Development Secrets

For local development, use `.dev.vars` (gitignored):

```ini
# .dev.vars (NOT committed)
API_KEY=sk-dev-1234567890
OAUTH_CLIENT_SECRET=dev-secret-12345
```

## Rate Limiting

### Tenant-Scoped Rate Limits

```typescript
const rateLimitKey = `${tenantId}:${userId}:${clientIp}`;
const rateLimiterId = env.RATE_LIMITER_DO.idFromName(rateLimitKey);
const rateLimiter = env.RATE_LIMITER_DO.get(rateLimiterId);

const allowed = await rateLimiter.checkLimit({
  perMinute: tenant.rateLimit.perMinute,
  burst: tenant.rateLimit.burst
});

if (!allowed) {
  return new Response('Rate limit exceeded', {
    status: 429,
    headers: {
      'Retry-After': '60',
      'X-RateLimit-Limit': tenant.rateLimit.perMinute.toString(),
      'X-RateLimit-Remaining': '0'
    }
  });
}
```

### DDoS Protection

**Cloudflare provides:**
- DDoS mitigation at edge
- Bot protection
- Rate limiting rules
- IP reputation

**Application-level:**
- Per-tenant rate limits
- Per-user rate limits
- Per-IP rate limits
- Exponential backoff

## Logging & Monitoring

### Safe Logging

**Rule:** Never log sensitive data.

```typescript
// ✅ Safe logging
logger.info('Chat request', {
  tenantId: tenant.tenantId,
  sessionId: sessionId.substring(0, 8) + '...',  // Truncated
  messageLength: message.length,
  requestId
});

// ❌ Unsafe logging
logger.info('Chat request', {
  tenantId: tenant.tenantId,
  sessionId,           // Full session ID
  message,             // User's message content!
  apiKey: env.API_KEY  // SECRET!
});
```

### Redaction Patterns

```typescript
function redactPII(message: string): string {
  // Redact emails
  message = message.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]');
  
  // Redact phone numbers
  message = message.replace(/\d{3}-\d{3}-\d{4}/g, '[PHONE]');
  
  // Redact SSNs
  message = message.replace(/\d{3}-\d{2}-\d{4}/g, '[SSN]');
  
  return message;
}
```

### Audit Logging

```typescript
// Log all mutations
async function deleteSession(
  tenantId: string,
  sessionId: string,
  requestId: string,
  env: Env
) {
  // Perform deletion
  const session = getSessionDO(tenantId, sessionId, env);
  await session.clear();

  // Audit log
  await logAudit({
    action: 'session.delete',
    tenantId,
    resourceId: sessionId,
    requestId,
    timestamp: Date.now(),
    userId: extractUserId(request)
  }, env);
}
```

## AI Gateway Security

### Gateway Metadata

**Rule:** Include tenant in gateway metadata for attribution.

```typescript
// ✅ Correct: Attribution in metadata
const response = await env.AI.run(model, inputs, {
  gateway: {
    id: tenant.aiGatewayId,
    metadata: { tenantId: tenant.tenantId }
  }
});

// ❌ Wrong: No attribution
const response = await env.AI.run(model, inputs);
```

### Budget Enforcement (M2)

```typescript
// Check token budget before request
const usage = await getTokenUsage(tenantId, env);
if (usage.thisMonth >= tenant.tokenBudget.monthly) {
  return fail(429, 'Monthly token budget exceeded', requestId);
}

// Track usage after request
await recordTokenUsage(tenantId, {
  promptTokens,
  completionTokens,
  cost
}, env);
```

## CORS Configuration

### Tenant-Specific CORS

```json
// tenant.config.json
{
  "cors": {
    "allowOrigins": ["https://app.acme.com"],
    "allowMethods": ["GET", "POST", "DELETE"],
    "allowHeaders": ["content-type", "x-api-key"],
    "maxAge": 86400
  }
}
```

```typescript
function handleCORS(request: Request, tenant: TenantContext): Response | null {
  const origin = request.headers.get('origin');
  
  if (request.method === 'OPTIONS') {
    // Preflight request
    if (!origin || !tenant.cors.allowOrigins.includes(origin)) {
      return new Response(null, { status: 403 });
    }

    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': tenant.cors.allowMethods.join(', '),
        'Access-Control-Allow-Headers': tenant.cors.allowHeaders.join(', '),
        'Access-Control-Max-Age': tenant.cors.maxAge.toString()
      }
    });
  }

  return null;  // Not a CORS preflight
}
```

## Common Vulnerabilities

### 1. SQL Injection (D1)

```typescript
// ❌ Vulnerable: String concatenation
const query = `SELECT * FROM users WHERE tenant_id = '${tenantId}'`;
const results = await env.DB.prepare(query).all();

// ✅ Safe: Parameterized query
const results = await env.DB.prepare(
  'SELECT * FROM users WHERE tenant_id = ?'
).bind(tenantId).all();
```

### 2. NoSQL Injection (Vectorize metadata)

```typescript
// ❌ Vulnerable: Unsanitized input in filter
const filter = { userId: { $eq: request.query.userId } };

// ✅ Safe: Validate input first
const UserIdSchema = z.string().uuid();
const userId = UserIdSchema.parse(request.query.userId);
const filter = { userId: { $eq: userId } };
```

### 3. Prototype Pollution

```typescript
// ❌ Vulnerable: Unvalidated merge
Object.assign(config, userInput);

// ✅ Safe: Validate with Zod
const validated = ConfigSchema.parse(userInput);
const config = { ...defaultConfig, ...validated };
```

### 4. Path Traversal

```typescript
// ❌ Vulnerable: User-controlled path
const file = await env.KV.get(`${tenantId}:files:${filename}`);

// ✅ Safe: Validate filename
const FilenameSchema = z.string().regex(/^[a-zA-Z0-9_-]+\.[a-z]+$/);
const validFilename = FilenameSchema.parse(filename);
const file = await env.KV.get(`${tenantId}:files:${validFilename}`);
```

### 5. Timing Attacks

```typescript
// ❌ Vulnerable: Early return on mismatch
function compareApiKeys(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  for (let i = 0; i < provided.length; i++) {
    if (provided[i] !== expected[i]) return false;  // Early return!
  }
  return true;
}

// ✅ Safe: Constant-time comparison
function compareApiKeys(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
```

## Incident Response

### Detection

**Monitor for:**
- Unexpected cross-tenant access attempts
- Rate limit violations
- Authentication failures
- Unusual token usage patterns
- Gateway errors

### Response Plan

1. **Identify** — What happened? Which tenant?
2. **Contain** — Block affected tenant/user
3. **Investigate** — Review logs, trace requests
4. **Remediate** — Fix vulnerability, rotate secrets
5. **Document** — Post-mortem, lessons learned

### Example: API Key Leak

```typescript
// Immediate response
async function rotateApiKey(tenantId: string, env: Env) {
  // 1. Generate new key
  const newKey = generateSecureKey();
  
  // 2. Update tenant config
  await updateTenantApiKey(tenantId, newKey, env);
  
  // 3. Invalidate old key
  await revokeApiKey(tenantId, env);
  
  // 4. Notify tenant
  await notifyTenant(tenantId, 'API key rotated due to security event', env);
  
  // 5. Audit log
  await logAudit({
    action: 'apikey.rotate',
    tenantId,
    reason: 'security_incident',
    timestamp: Date.now()
  }, env);
}
```

## Compliance

### GDPR

- **Right to erasure:** Implement session/data deletion
- **Data minimization:** Don't log PII unnecessarily
- **Consent:** Track consent in tenant config
- **Data portability:** Export APIs for user data

### SOC 2

- **Access controls:** Tenant isolation enforced
- **Audit logging:** All mutations logged
- **Encryption:** TLS in transit, at rest via Cloudflare
- **Change management:** Version control, CI/CD

## Security Checklist

### Before Deployment

- [ ] All endpoints validate input with Zod
- [ ] All storage operations are tenant-scoped
- [ ] All secrets use Wrangler secrets (not in code)
- [ ] Rate limiting enabled for all endpoints
- [ ] CORS configured per tenant
- [ ] Audit logging for all mutations
- [ ] Error messages don't leak sensitive info
- [ ] Session IDs are cryptographically secure
- [ ] DO IDs encode tenant
- [ ] Vectorize queries use namespace parameter

### Code Review

- [ ] No hardcoded secrets or API keys
- [ ] Input validation present
- [ ] Tenant context passed explicitly
- [ ] Error handling doesn't reveal internals
- [ ] Logging doesn't include PII or secrets
- [ ] SQL queries use parameterization
- [ ] File paths validated/sanitized

## Resources

- **[Multi-Tenancy](Multi-Tenancy.md)** — Tenant isolation patterns
- **[Development Guide](Development-Guide.md)** — Development workflow
- **[Testing Guide](Testing-Guide.md)** — Security testing
- **[Troubleshooting](Troubleshooting.md)** — Debug security issues

## Security Disclosure

If you discover a security vulnerability, please:

1. **Do NOT** open a public issue
2. Email: security@example.com (update with actual contact)
3. Include: description, steps to reproduce, impact
4. Allow 90 days for remediation before public disclosure
