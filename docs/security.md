# Security Model

This document defines the security posture of the multi-tenant Cloudflare Workers AI platform. It covers tenant isolation, input validation, rate limiting, secrets management, and the planned authentication roadmap.

## Threat model

The primary threats in a multi-tenant AI platform are:

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Cross-tenant data access | Data breach — one tenant reads another's sessions, cache, or vectors | Tenant-scoped keys, DO IDs, Vectorize namespaces (see [tenancy.md](tenancy.md)) |
| Prompt injection / abuse | Cost runaway, harmful outputs | Input validation (Zod schemas), message length caps, rate limiting |
| Rate limit bypass | Resource exhaustion, denial of service to other tenants | Per-tenant + per-user DO-based rate limiting with sliding window |
| Unauthorized access | Unintended tenant resolution, data exposure | Mandatory tenant resolution; reject unresolvable requests |
| Secret exposure | API keys, account IDs leaked | Wrangler secrets/vars; no secrets in code or logs |
| Oversized payloads | Memory exhaustion, worker crash | `MAX_REQUEST_BODY_SIZE` validation before processing |

## Security layers

### 1. Tenant isolation (M0)

Every request must resolve to a tenant before any business logic, storage access, or AI call executes. This is the foundational security boundary.

- **Enforcement:** `resolveTenant()` runs as the first step in the request lifecycle. Unresolved requests receive `400 Tenant required`.
- **Scope:** All storage keys (KV), Durable Object IDs, Vectorize namespaces, and AI Gateway metadata include the tenant ID.
- **Testing:** `resolveTenant.test.ts`, `session-isolation.test.ts`, `kv-prefix.test.ts`, `do-name.test.ts`

See [tenancy.md](tenancy.md) for the complete isolation model and enforcement rules.

### 2. Input validation (M0+M1)

All request payloads are validated with Zod schemas before processing.

| Endpoint | Schema | Validations |
|----------|--------|-------------|
| `POST /chat` | `chatRequestSchema` | `sessionId` (UUID), `message` (1-10000 chars), `stream` (boolean, default true), `userId` (optional, min 1 char) |
| All endpoints | Body size check | `Content-Length` or buffered body vs `MAX_REQUEST_BODY_SIZE`; rejects with `413` |

Invalid requests receive `400` with the standard error envelope and trace ID. Validation errors do not leak internal details.

### 3. Rate limiting (M1)

Rate limiting prevents abuse and ensures fair resource allocation across tenants.

- **Mechanism:** `RateLimiter` Durable Object with sliding window algorithm (see [ADR-003](adrs/ADR-003-sliding-window-rate-limiting.md))
- **Scope:** Per-tenant + per-user. Key format: `${tenantId}:ratelimit:${userKey}`
- **Configuration:** `rateLimit.perMinute` and `rateLimit.burst` in `tenant.config.json`
- **Response:** `429 Too Many Requests` with standard headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- **Isolation:** Separate `RATE_LIMITER_DO` binding (see [ADR-002](adrs/ADR-002-separate-do-namespaces.md)). One tenant's rate limit state cannot affect another's.
- **Testing:** `rate-limit.test.ts`, `rate-limiter.test.ts`

### 4. Request tracing (M0)

Every response includes a trace ID for correlation and debugging:

- Sourced from `cf-ray` header (Cloudflare) or `x-request-id` header (client) or generated
- Included in all success and error responses via the response envelope
- Included in rate limit rejection responses

Trace IDs enable incident investigation without exposing internal state.

### 5. Error handling (M0)

All errors use the standard response envelope:

```json
{
  "ok": false,
  "error": {
    "code": "error_code",
    "message": "Human-readable message"
  },
  "traceId": "..."
}
```

- Error messages are generic and do not leak implementation details (stack traces, binding names, internal paths).
- Known error codes: `tenant_required`, `unknown_tenant`, `invalid_request`, `rate_limited`, `payload_too_large`, `not_found`, `method_not_allowed`

## Secrets management

- **No secrets in code:** API keys, account IDs, and credentials are never committed to the repository.
- **Wrangler secrets:** Sensitive values are set via `wrangler secret put` and accessed through `env` bindings.
- **Tenant API keys:** Stored in `tenant.config.json` for resolution mapping only. These are not Cloudflare API tokens.
- **Environment variables:** Non-sensitive configuration (model IDs, feature flags) can be set as `vars` in `wrangler.jsonc`.

## Data handling

- **No PII in logs:** Structured logs must not include user messages, API keys, or personal data.
- **Token redaction:** Log entries should redact sensitive fields. The `packages/observability` module (M7) will enforce this.
- **Session data:** Chat messages are stored in Durable Objects (tenant-scoped). Retention is configurable per tenant (`sessionRetentionDays`, `maxMessagesPerSession`). Expired messages are automatically pruned.
- **D1 metadata:** Only stores metadata (timestamps, token counts, roles). Raw prompts are never written to D1.

## CORS

CORS policy is planned for per-tenant configuration. Current state:

- **M0-M1:** No CORS headers set (local development only)
- **Planned (M2+):** `allowedOrigins` field in `tenant.config.json` with strict per-tenant origin matching

## Authentication roadmap

Authentication is optional but planned:

| Phase | Mechanism | Status |
|-------|-----------|--------|
| M0-M1 | Tenant resolution via `x-tenant-id`, hostname, or `x-api-key` | Implemented |
| M2+ | JWT verification middleware hook (optional per tenant) | Planned |
| M5+ | Per-tool permission gating (tool execution requires auth) | Planned |

The current `x-api-key` resolution is a tenant identification mechanism, not a full authentication system. It identifies which tenant a request belongs to but does not authenticate individual users within a tenant.

## Security testing

| Test | What it verifies |
|------|-----------------|
| `resolveTenant.test.ts` | Unresolvable requests are rejected; priority order is correct |
| `health.test.ts` | Missing tenant returns 400; wrong tenant returns 404 |
| `session-isolation.test.ts` | DO names encode tenant; cross-tenant access denied |
| `rate-limit.test.ts` | Over-limit requests receive 429 with correct headers |
| `rate-limiter.test.ts` | Sliding window correctly tracks and enforces limits |
| `request-size.test.ts` | Oversized payloads rejected with 413 |
| `chat.test.ts` | Invalid chat requests rejected; tenant context required |

## Anti-patterns

See [footguns.md](footguns.md) for the full catalog of security-relevant anti-patterns including:

- Direct binding access without tenant scoping
- KV/DO/Vectorize operations without tenant ID
- AI calls bypassing the gateway
- Rate limiting without tenant isolation
