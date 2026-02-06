# ADR-003: Sliding Window Rate Limiting via Durable Objects

**Status:** Accepted
**Date:** 2026-02-06
**Milestone:** M1

## Context

Rate limiting must be per-tenant and per-user to prevent abuse without penalizing other tenants. Options evaluated:

1. **KV-based counters** — increment a counter in KV with TTL
2. **DO-based sliding window** — store timestamps in a Durable Object
3. **External service** — use a third-party rate limiting API

## Decision

Use DO-based sliding window with the `RateLimiter` Durable Object.

## Rationale

- **Accuracy:** Sliding window provides smooth rate limiting without the burst-at-boundary problem of fixed windows. Timestamps are stored and expired entries pruned on each check.
- **Strong consistency:** DO storage is strongly consistent within a single instance, unlike KV (~60s eventual consistency). A KV counter could allow burst overruns during propagation delay.
- **Tenant isolation:** Each tenant+user combination gets its own DO instance via `idFromName('${tenantId}:ratelimit:${userKey}')`. One tenant's rate limit state cannot affect another's.
- **No external dependencies:** Runs entirely on Cloudflare's edge network.

KV counters were rejected due to eventual consistency (~60s propagation) making them unsuitable for accurate rate enforcement. External services were rejected to avoid latency and dependency on third-party availability.

## Trade-offs

- **DO cold start:** First request to a new DO instance incurs ~100-500ms cold start. Mitigated by the fact that subsequent requests within the window hit a warm instance.
- **Storage cost:** Each timestamp is stored individually. For high-volume users, this means more storage ops. Mitigated by pruning expired timestamps on every `/check` call.
- **Single-instance bottleneck:** Each DO instance handles ~1K req/s. For users exceeding this, sharding by hash would be needed (not implemented in M1).

## Consequences

- Rate limit configuration is per-tenant via `tenant.config.json` fields: `rateLimit.perMinute` and `rateLimit.burst`.
- The `/check` endpoint on the DO accepts `{ limit, windowSec }` and returns `{ allowed, remaining, resetAt }`.
- Standard rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are returned on all `/chat` responses.
- Over-limit requests receive a `429` status with the standard error envelope and trace ID.

## References

- [docs/rate-limiting.md](../rate-limiting.md) — full specification
- [`apps/worker-api/src/rate-limiter-do.ts`](../../apps/worker-api/src/rate-limiter-do.ts) — implementation
- [`tests/rate-limiter.test.ts`](../../tests/rate-limiter.test.ts) — unit tests
- [`tests/rate-limit.test.ts`](../../tests/rate-limit.test.ts) — integration test
