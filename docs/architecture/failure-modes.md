# Failure Modes & Mitigation

This document outlines potential failure modes for system components, their impact, and the strategies to mitigate or respond to them. The goal is to build a resilient system by anticipating failures.

## 1. Guiding Principles

- **Fail Closed:** For any security or tenancy-related check, the default behavior on failure is to deny the request.
- **Graceful Degradation:** Non-critical features (e.g., caching, advanced search filters) should not cause a total system outage if they fail. The system should degrade gracefully to a more basic functional state.
- **Idempotency:** Operations, especially those involving state changes or billing, should be designed to be idempotent where possible to prevent duplicate effects from retries.
- **Traceability:** Every failure must be logged with a `requestId` and `tenantId` to enable rapid debugging.

## 2. Component Failure Analysis

### 2.1 Worker (`worker-api`)

| Failure Mode | Impact | Mitigation & Response |
| :--- | :--- | :--- |
| **Uncaught Exception** | Request fails with a generic "Worker threw an error" (HTTP 500). | **Mitigation:** A global `try/catch` in the main `fetch` handler ensures all errors are caught and formatted into a standard JSON error response with a `traceId`.<br>**Response:** Alert on a spike in the `errors_total` metric or HTTP 5xx status codes. Use the `traceId` from logs to find the exact error and stack trace. |
| **High Cold Start Latency** | The first request to an idle Worker experiences high latency (e.g., >1s). | **Mitigation:** For production tenants, use Provisioned Concurrency to keep a minimum number of instances warm. For non-critical tenants, accept the latency.<br>**Response:** Monitor P99 latency (`latency_ms_histogram`). If it exceeds the SLO, consider enabling Provisioned Concurrency for more tenants. |

### 2.2 Tenant Resolution

| Failure Mode | Impact | Mitigation & Response |
| :--- | :--- | :--- |
| **Tenant Not Found** | A request is made with an invalid `x-tenant-id`, hostname, or API key. | **Mitigation:** The `resolveTenant` middleware fails closed, immediately rejecting the request with an HTTP 400/404 and a clear error message. This is a critical security gate.<br>**Response:** This is expected behavior for invalid requests. Monitor logs for a high volume of resolution failures from a specific IP, which could indicate a misconfiguration or malicious probing. |
| **Invalid Tenant Config** | A `tenant.config.json` file is malformed or fails Zod validation. | **Mitigation:** The build or deployment process should validate all tenant configs. The tenant loader should refuse to load an invalid config, preventing the worker from starting with a broken state.<br>**Response:** Fix the invalid `tenant.config.json` file and redeploy. |

### 2.3 KV Store

| Failure Mode | Impact | Mitigation & Response |
| :--- | :--- | :--- |
| **Read/Write Error** | The Worker fails to read from or write to the KV namespace. | **Mitigation:** Implement a retry mechanism with exponential backoff for KV operations. For reads, the application should handle a `null` response gracefully (e.g., treat as a cache miss).<br>**Response:** Monitor KV operation metrics provided by Cloudflare. |
| **Eventual Consistency Delay** | A write to KV is not immediately visible at all edge locations (up to 60s delay). | **Mitigation:** Do not use KV for operations requiring strong read-after-write consistency (e.g., financial transactions, session state). Use Durable Objects instead. This is documented and accepted for use cases like feature flags.<br>**Response:** During an incident response that involves changing a feature flag in KV, be aware of the propagation delay. |

### 2.4 Durable Objects (`ChatSession`, `RateLimiter`)

| Failure Mode | Impact | Mitigation & Response |
| :--- | :--- | :--- |
| **Uncaught Exception in DO** | The request that invoked the DO fails. State may be left inconsistent. | **Mitigation:** All public methods within the DO class must be wrapped in a `try/catch` block. Errors must be logged with the `tenantId` and DO ID.<br>**Response:** Alert on a spike in `durable_object_invocations_total` with a `status: error` label. Use logs to debug the specific DO instance. |
| **CPU Limit Exceeded** | The DO is throttled or terminated, causing requests to fail. | **Mitigation:** Optimize code within the DO to be efficient. For "hot" objects (like a single tenant's global rate limiter), consider sharding the object by hashing the key to distribute load across multiple DO instances.<br>**Response:** Alert on high `durable_object_cpu_time_ms_histogram` values. |
| **Storage Limit Exceeded** | Writes to the DO fail. | **Mitigation:** Implement and enforce retention policies (e.g., `maxMessagesPerSession` in `ChatSession` DO). For long-term storage, archive data from the DO to a cheaper storage solution like R2.<br>**Response:** Monitor DO storage metrics. |

### 2.5 AI Gateway & Workers AI (M2+)

| Failure Mode | Impact | Mitigation & Response |
| :--- | :--- | :--- |
| **Provider API Outage/Slow** | Chat and other AI features are unavailable or have very high latency. | **Mitigation:** Use the AI Gateway's built-in retry and timeout capabilities. Configure a fallback model (e.g., a smaller, faster model) in the Gateway rules if the primary model fails.<br>**Response:** AI Gateway analytics will show a high error rate. The system should return a clear error to the user (e.g., "AI provider is currently unavailable"). |
| **Quota Exceeded / Invalid Key** | AI requests are rejected by the provider. | **Mitigation:** Use AI Gateway policies to enforce per-tenant budgets and rate limits, preventing any single tenant from exhausting the global quota.<br>**Response:** AI Gateway logs will show the reason for rejection (auth, quota). |

### 2.6 Vectorize (M3+)

| Failure Mode | Impact | Mitigation & Response |
| :--- | :--- | :--- |
| **Query Fails** | Retrieval for RAG/search is unavailable. | **Mitigation:** Implement retries. As a fallback, the RAG pipeline can be configured to skip the retrieval step and respond using only the LLM's base knowledge, albeit with a warning that it cannot consult internal documents.<br>**Response:** Monitor `vectorize_queries_total` with a `status: error` label. |
| **Indexing Fails** | New documents cannot be added to the search index. | **Mitigation:** The ingestion pipeline should use a queue (e.g., Cloudflare Queues) to buffer documents. If an upsert to Vectorize fails, the message can be retried later.<br>**Response:** Monitor the dead-letter queue for the ingestion pipeline. |