# ADR-002: Separate Durable Object Namespaces for Sessions and Rate Limiting

**Status:** Accepted
**Date:** 2026-02-06
**Milestone:** M1

## Context

M1 introduces two Durable Object classes: `ChatSession` (conversation history) and `RateLimiter` (request throttling). Both are tenant-scoped. The question is whether to use a single DO namespace or separate ones.

## Decision

Use separate DO bindings: `CHAT_SESSION` for `ChatSession` and `RATE_LIMITER_DO` for `RateLimiter`.

## Rationale

- **Contention isolation:** Rate limit checks are high-frequency, low-latency operations. Session operations involve larger payloads (message history). Sharing a namespace would create head-of-line blocking.
- **Independent scaling:** Each DO class can scale independently based on its workload pattern.
- **Operational clarity:** Separate bindings make it obvious which DO is being accessed at each call site. Debugging and monitoring are cleaner.
- **Migration independence:** Each class gets its own migration tag (`v1`), so schema changes to one don't affect the other.

A single namespace was rejected because a burst of rate-limit checks could delay session reads, degrading chat latency.

## Consequences

- Two DO bindings must be declared in every tenant's `wrangler.jsonc`.
- The `Env` interface includes both `CHAT_SESSION` and `RATE_LIMITER_DO` as `DurableObjectNamespace`.
- Both classes are exported from `apps/worker-api/src/index.ts` for Cloudflare's DO discovery.

## References

- [docs/rate-limiting.md](../rate-limiting.md) — rate limiter design
- [docs/sessions.md](../sessions.md) — session lifecycle
- [`apps/worker-api/src/session-do.ts`](../../apps/worker-api/src/session-do.ts) — ChatSession implementation
- [`apps/worker-api/src/rate-limiter-do.ts`](../../apps/worker-api/src/rate-limiter-do.ts) — RateLimiter implementation
