# Pull Request: M1 Streaming Chat + Sessions Complete

## Summary

This PR completes **M1 (Chat + Sessions)**. It adds streaming chat, session state, rate limiting, tenant-scoped cache extensions, and the M1 test suites.

## What Changed

1. **Chat + Sessions**
   - `/chat` streaming SSE response with non-stream fallback
   - Session history and clear endpoints
   - `ChatSession` Durable Object with retention enforcement

2. **Rate Limiting**
   - `RateLimiter` Durable Object with tenant-scoped keying
   - Rate limit headers on `/chat`
   - Rate limit strategy documented

3. **Storage + Schemas**
   - Chat request schema added to `packages/core`
   - Tenant config schema extended with retention settings
   - KV cache adapter supports cache prefixes + TTL

4. **Docs + Tests**
   - Streaming, sessions, and rate limiting docs added
   - Streaming, session isolation, and rate limit tests added

## M1 Issues Complete (#15–#24)

- ✅ #15 `/chat` endpoint with schema validation and tenant enforcement
- ✅ #16 Streaming response contract (SSE)
- ✅ #17 ChatSession Durable Object (tenant-scoped)
- ✅ #18 History retention policy
- ✅ #19 KV cache adapter extensions
- ✅ #20 RateLimiter Durable Object
- ✅ #21 Rate limit keying strategy doc
- ✅ #22 Streaming behavior tests
- ✅ #23 Session isolation tests
- ✅ #24 Rate limit enforcement tests

## Project Status

- GitHub issues #15–#24 moved to Done and assigned to the M1 milestone.

## Test Results

```
npm test
npm run typecheck
```

## Key Files

- `apps/worker-api/src/index.ts`
- `apps/worker-api/src/session-do.ts`
- `apps/worker-api/src/rate-limiter-do.ts`
- `packages/core/src/chat/schema.ts`
- `packages/core/src/tenant/schema.ts`
- `packages/storage/src/kv.ts`
- `docs/streaming.md`
- `docs/sessions.md`
- `docs/rate-limiting.md`
- `docs/milestones/M1.md`

## Review Notes

This PR introduces new DO classes and endpoints but uses mock chat responses until M2. No breaking changes to existing M0 endpoints.

## Requests

- Please request review from Claude.
