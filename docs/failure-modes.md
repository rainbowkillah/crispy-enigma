# Failure Modes & Mitigation

This document catalogues known failure modes, their impact, and how to handle them.

## Template

| Field | Description |
|---|---|
| **Scenario** | What goes wrong? |
| **Impact** | What does the user see? |
| **Detection** | How do we know it's happening? |
| **Mitigation** | Automated handling (retries, fallbacks). |
| **Recovery** | Manual or automatic recovery steps. |

## Scenarios

### 1. AI Gateway Downtime

| Field | Details |
|---|---|
| **Scenario** | Cloudflare AI Gateway returns 5xx errors. |
| **Impact** | Chat and Search endpoints fail. Users see "AI provider unavailable". |
| **Detection** | Spike in `ai_error` metric. Logs show `AI Gateway Error`. |
| **Mitigation** | Automatic retry (3x) with exponential backoff. Fallback to direct model access if configured. |
| **Recovery** | Auto-recovery when upstream restores service. |

### 2. Vectorize Timeout

| Field | Details |
|---|---|
| **Scenario** | Vector DB queries take > 10s or timeout. |
| **Impact** | Search returns fallback results (keyword only) or fails. |
| **Detection** | `retrievalMs` spike. `ai_error` logs. |
| **Mitigation** | Circuit breaker opens after 5 failures. Return "No sources found" gracefully. |
| **Recovery** | Circuit breaker resets after 1 minute. |

### 3. Rate Limiter DO Overload

| Field | Details |
|---|---|
| **Scenario** | Durable Object hosting rate limiter is overwhelmed. |
| **Impact** | Requests hang or fail with 503. |
| **Detection** | High CPU on DO. Latency spike in `rateLimit` check. |
| **Mitigation** | Fail open (allow request) if limiter is unreachable (config flag). |
| **Recovery** | DO restarts automatically. |

### 4. KV Propagation Delay

| Field | Details |
|---|---|
| **Scenario** | New tenant config not visible immediately. |
| **Impact** | "Unknown tenant" error for valid new tenant. |
| **Detection** | 404 metrics for valid tenants. |
| **Mitigation** | Cache tenant config in memory with short TTL. |
| **Recovery** | Wait for eventual consistency (up to 60s). |
