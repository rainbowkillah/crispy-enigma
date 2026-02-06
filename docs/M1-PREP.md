# M1 Preparation: Chat + Sessions

## Overview

M1 builds streaming chat endpoints, Durable Object sessions, KV caching, and rate limiting on top of the M0 foundation.

**Status:** 🔵 Ready to start (M0 complete)

## M1 Deliverables

According to [docs/plan.md](plan.md), M1 includes issues #15-#24:

### Core Features

#### #15 - Build /chat endpoint with request schema
**Deliverable:** REST endpoint accepting chat messages with Zod validation

**Acceptance Criteria:**
- POST `/chat` endpoint exists
- Request schema validates:
  - `sessionId` (UUID string)
  - `message` (string, 1-10000 chars)
  - `stream` (boolean, optional, default true)
- Returns 400 for invalid requests with trace ID
- Tenant context required before processing

**Implementation Notes:**
- Use Zod schema from `packages/core`
- Follow tenant resolution pattern from M0
- Wire up to session DO (see #17)

---

#### #16 - Define streaming response contract (SSE vs chunked)
**Deliverable:** Documentation + implementation of streaming response format

**Options:**
- **SSE (Server-Sent Events):** `text/event-stream` with `data:` lines
- **Chunked Transfer:** `Transfer-Encoding: chunked` with newline-delimited JSON

**Recommendation:** SSE for better browser compatibility

**Acceptance Criteria:**
- Streaming format documented in `docs/streaming.md`
- Response type: `text/event-stream` or `application/x-ndjson`
- Tokens stream progressively (not buffered)
- Final message includes metadata (tokens, latency)

**Implementation Notes:**
- Use `TransformStream` for proper backpressure
- Include trace ID in error events
- Graceful fallback for non-streaming clients

---

#### #17 - Implement Durable Object session store (tenant-scoped)
**Deliverable:** `ChatSession` Durable Object class

**Acceptance Criteria:**
- DO class exported from `apps/worker-api/src/session-do.ts`
- DO ID includes tenant: `${tenantId}:${sessionId}`
- Methods:
  - `appendMessage(role, content, metadata)`
  - `getHistory(limit?)` - returns last N messages
  - `clear()` - wipes session
- Storage uses SQLite (new DO default) or KV-style put/get
- Tenant isolation enforced (DO name encoding)

**Implementation Notes:**
- Use `env.CHAT_SESSION.idFromName(doName(tenantId, sessionId))`
- Store messages with timestamp, role (user/assistant/system), tokens
- Consider pagination for large sessions (>100 messages)

---

#### #18 - Add conversation history with retention policy
**Deliverable:** Session history retrieval + automatic cleanup

**Acceptance Criteria:**
- Session stores up to 1000 messages (configurable)
- Messages older than 30 days auto-purged (configurable per tenant)
- `getHistory()` returns newest-first with limit
- History includes: role, content, timestamp, tokenCount

**Implementation Notes:**
- Use cron trigger or lazy cleanup on read
- Tenant config includes: `sessionRetentionDays`, `maxMessagesPerSession`
- Consider cost of SQLite vs KV storage for large sessions

---

#### #19 - Implement KV cache layer (tenant-scoped keys)
**Deliverable:** KV caching adapter with tenant prefixing

**Acceptance Criteria:**
- KV keys always prefixed: `${tenantId}:cache:${key}`
- Methods: `get(tenantId, key)`, `put(tenantId, key, value, ttl?)`
- TTL support (default 3600s)
- Cache miss returns null (not error)

**Implementation Notes:**
- Extend `packages/storage/src/kv.ts`
- Use for: feature flags, prompt templates, model configs
- KV has eventual consistency (~60s propagation)

---

#### #20 - Implement DO-based rate limiter (per tenant + per IP/user)
**Deliverable:** `RateLimiter` Durable Object class

**Acceptance Criteria:**
- Separate DO namespace: `RATE_LIMITER_DO` (NOT `CHAT_SESSION`)
- DO ID includes tenant + scope: `${tenantId}:ratelimit:${userId}`
- Sliding window algorithm (count requests in last N seconds)
- Methods:
  - `checkLimit(key, limit, windowSec)` → {allowed: boolean, remaining: number, resetAt: number}
- Rejects over-limit requests with 429 status
- Response includes headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Implementation Notes:**
- Use SQLite for high-performance counters
- Per-tenant limits from `tenant.config.json`: `rateLimit.perMinute`, `rateLimit.burst`
- Per-user/IP limits from request headers
- Consider multiple scopes: `tenant`, `user`, `ip`

---

#### #21 - Define rate limit keying strategy (tenant+user+ip)
**Deliverable:** Documentation of rate limit key composition

**Acceptance Criteria:**
- Document key format: `${tenantId}:ratelimit:${scope}:${identifier}`
- Scopes:
  - `tenant`: Global per-tenant limit
  - `user`: Per-user limit (from `x-user-id` header or API key)
  - `ip`: Per-IP limit (from `request.headers.get('cf-connecting-ip')`)
- Document priority: most restrictive limit wins
- Document in `docs/rate-limiting.md`

**Implementation Notes:**
- Check all applicable scopes in order
- Return first rejection
- Include all limits in response headers

---

### Testing

#### #22 - Create streaming behavior tests
**Deliverable:** Test suite for streaming responses

**Acceptance Criteria:**
- Test: Tokens arrive progressively (not buffered)
- Test: Stream includes final metadata message
- Test: Stream handles errors gracefully
- Test: Non-streaming fallback works
- Located in `tests/streaming.test.ts`

**Implementation Notes:**
- Use Miniflare for DO testing
- Mock AI responses for deterministic tests
- Verify backpressure handling

---

#### #23 - Create session isolation tests
**Deliverable:** Test suite for session boundary enforcement

**Acceptance Criteria:**
- Test: Sessions isolated by tenant (cross-tenant access fails)
- Test: Sessions isolated by sessionId (cross-session access fails)
- Test: Session history survives worker restart (DO durability)
- Test: Session cleanup respects retention policy
- Located in `tests/session-isolation.test.ts`

**Implementation Notes:**
- Create sessions for 2+ tenants
- Verify cross-tenant access returns 404 or 403
- Use Miniflare for DO persistence testing

---

#### #24 - Create rate limit enforcement tests
**Deliverable:** Test suite for rate limiting

**Acceptance Criteria:**
- Test: Requests under limit are allowed
- Test: Requests over limit are rejected (429)
- Test: Rate limit resets after window expires
- Test: Multiple scopes (tenant, user, ip) enforced
- Test: Headers include correct limit/remaining/reset values
- Located in `tests/rate-limit.test.ts`

**Implementation Notes:**
- Use fake timers to advance window
- Test burst limits separately from sustained limits
- Verify sliding window behavior

---

## M1 Acceptance Criteria

From [docs/plan.md](plan.md):

- ✅ Session messages persist for same tenant/session
- ✅ Cross-tenant session access is denied
- ✅ Rate limiter rejects over-limit requests with trace id
- ✅ Rate limiter uses dedicated `RATE_LIMITER_DO` namespace, not `CHAT_SESSION`

## Architecture Changes

### New Durable Object Classes

1. **ChatSession** (`apps/worker-api/src/session-do.ts`)
   - Purpose: Store conversation history
   - Binding: `CHAT_SESSION` (in `wrangler.jsonc`)
   - ID format: `${tenantId}:${sessionId}`

2. **RateLimiter** (`apps/worker-api/src/rate-limiter-do.ts`)
   - Purpose: Enforce request rate limits
   - Binding: `RATE_LIMITER_DO` (in `wrangler.jsonc`)
   - ID format: `${tenantId}:ratelimit:${scope}:${id}`

### New Endpoints

- `POST /chat` - Streaming chat with session history
- `GET /chat/:sessionId/history` (optional) - Retrieve session history
- `DELETE /chat/:sessionId` (optional) - Clear session

### Updated Packages

- **`packages/storage`**: Add KV cache methods
- **`packages/core`**: Add chat request/response schemas
- **`packages/ai`**: Placeholder for M2 (not used in M1 yet)

### Wrangler Config Updates

Each tenant's `wrangler.jsonc` needs:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "CHAT_SESSION",
        "class_name": "ChatSession",
        "script_name": "worker-api"
      },
      {
        "name": "RATE_LIMITER_DO",
        "class_name": "RateLimiter",
        "script_name": "worker-api"
      }
    ]
  }
}
```

## Dependencies

No new runtime dependencies needed. All features use Cloudflare primitives.

## Development Workflow

### 1. Implement Durable Objects First
- `ChatSession` DO
- `RateLimiter` DO
- Export both from `apps/worker-api/src/index.ts`

### 2. Add /chat Endpoint
- Request schema validation
- Tenant resolution (already done in M0)
- Session DO interaction
- Rate limit check

### 3. Implement Streaming
- SSE or chunked response format
- TransformStream for backpressure
- Error handling

### 4. Add KV Caching
- Extend storage adapter
- Cache common queries (prompt templates, feature flags)

### 5. Write Tests
- Session isolation
- Rate limiting
- Streaming behavior

### 6. Update Documentation
- `docs/streaming.md` - Streaming format
- `docs/rate-limiting.md` - Rate limit strategy
- `docs/sessions.md` - Session lifecycle

## Testing Strategy

### Unit Tests
- Zod schema validation
- DO helper functions (ID generation)
- KV key prefixing
- Rate limit calculation logic

### Integration Tests (with Miniflare)
- Full /chat request flow
- Session persistence across requests
- Rate limit enforcement
- Cross-tenant isolation

### Manual Testing
- `npm run dev -- --tenant=example`
- Send POST requests to `/chat`
- Verify streaming behavior in browser
- Test rate limit with load script

## Risks & Mitigations

### Risk: DO Cold Start Latency
**Impact:** First session access may be slow (100-500ms)
**Mitigation:** 
- Keep DOs warm with periodic pings
- Document expected latency in SLA
- Consider caching first message in KV

### Risk: Rate Limit DO Contention
**Impact:** High traffic to single user/IP may overwhelm single DO
**Mitigation:**
- Shard rate limiter by hash of key
- Use multiple DO instances per scope
- Fallback to KV-based limits if DO fails

### Risk: Session Storage Costs
**Impact:** 1000 messages per session * many sessions = high DO storage cost
**Mitigation:**
- Aggressive retention policy (7-30 days)
- Compress old messages
- Archive to R2 or external DB

### Risk: Streaming Compatibility
**Impact:** Some clients may not support SSE
**Mitigation:**
- Provide non-streaming fallback
- Return full response if `stream: false`
- Document client requirements

## Success Metrics

### Functional
- ✅ All M1 tests passing (3 new test files, ~15+ tests)
- ✅ TypeScript compilation with no errors
- ✅ Manual /chat request returns streaming response
- ✅ Rate limiter blocks over-limit requests

### Performance
- Chat latency (P50): <200ms (including DO session read)
- Chat latency (P95): <500ms
- Rate limit check latency: <50ms (P95)
- Session history retrieval (100 messages): <100ms (P95)

### Reliability
- Session persistence: 99.9% (DO durability)
- Rate limiter accuracy: 99% (some variance acceptable)
- No cross-tenant data leakage

## M1 Checklist

### Core Implementation
- [ ] #15 - Build /chat endpoint with request schema
- [ ] #16 - Define streaming response contract
- [ ] #17 - Implement ChatSession Durable Object
- [ ] #18 - Add conversation history with retention
- [ ] #19 - Implement KV cache layer
- [ ] #20 - Implement RateLimiter Durable Object
- [ ] #21 - Define rate limit keying strategy

### Testing
- [ ] #22 - Create streaming behavior tests
- [ ] #23 - Create session isolation tests
- [ ] #24 - Create rate limit enforcement tests

### Documentation
- [ ] Document streaming format in `docs/streaming.md`
- [ ] Document rate limiting in `docs/rate-limiting.md`
- [ ] Document session lifecycle in `docs/sessions.md`
- [ ] Update `docs/handoff-M1.md` on completion

### Configuration
- [ ] Add DO bindings to `wrangler.jsonc` templates
- [ ] Update tenant config schema for session/rate limit settings
- [ ] Update `packages/core/src/env.ts` with DO bindings

### Verification
- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Manual /chat endpoint test with streaming
- [ ] Manual rate limit test (exceed threshold)
- [ ] Cross-tenant session isolation verified

---

## Next Milestone: M2

After M1 completion, the next milestone is **M2: AI Gateway Integration**.

M2 will connect the /chat endpoint to Workers AI via AI Gateway for actual model inference. M1 can use mock responses for testing.

See [docs/plan.md](plan.md) for M2 details.
