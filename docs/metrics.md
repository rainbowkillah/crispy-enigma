# Metrics & Observability

This document defines the project's strategy for logging, metrics, and tracing. Observability is a primary feature, not an afterthought.

## 1. Philosophy
- **Structured Logs:** All logs are emitted as structured JSON to be easily parsed, indexed, and queried.
- **Actionable Metrics:** We measure what matters: latency, cost, error rates, and quality signals. Metrics are tagged to allow for deep analysis.
- **Traceability:** Every request is assigned a unique ID that is propagated through logs and external calls, enabling end-to-end tracing of its lifecycle.
- **No PII:** Logs must not contain Personally Identifiable Information (PII). Sensitive data like API keys or user content is redacted by default.

## 2. Structured Logging

All log entries will adhere to a common JSON format.

- **Format:** Structured JSON
- **Required Fields:**
  - `timestamp`: ISO 8601 timestamp.
  - `level`: `info`, `warn`, `error`.
  - `message`: The log message.
  - `tenantId`: The resolved tenant ID for the request.
  - `requestId`: The unique correlation ID for the request (e.g., from `cf-ray`).
  - `route`: The matched URL route (e.g., `/chat`, `/search`).
  - `latencyMs`: Total request processing time in milliseconds.
  - `status`: The HTTP status code of the response.
  - `source`: The package or module emitting the log (e.g., `storage-adapter`, `rag-pipeline`).
  - `cf`: Cloudflare-specific request properties like colo (`cf.colo`).
  - `durableObjectClass`: The class name of a DO being invoked.
  - `durableObjectId`: The ID of the DO instance.

## 3. Metrics
Metrics will be collected for key performance and usage indicators. They must all be tagged with `tenantId` to allow for per-tenant monitoring.

### 3.1 Core API Metrics
- `requests_total`: Counter for total requests. (Labels: `tenantId`, `route`, `method`, `status`)
- `errors_total`: Counter for unexpected errors. (Labels: `tenantId`, `route`, `error_type`)
- `latency_ms_histogram`: Histogram of request latency. (Labels: `tenantId`, `route`)
- `rate_limited_total`: Counter for requests blocked by the rate limiter. (Labels: `tenantId`)

### 3.2 AI & Cost Metrics
These are critical for monitoring cost and AI provider performance.
- `ai_requests_total`: Counter for calls to AI models. (Labels: `tenantId`, `model_name`, `status`)
- `ai_latency_ms_histogram`: Histogram of latency for AI model responses. (Labels: `tenantId`, `model_name`)
- `ai_tokens_prompt_total`: Counter for prompt tokens sent to models. (Labels: `tenantId`, `model_name`)
- `ai_tokens_completion_total`: Counter for completion tokens received from models. (Labels: `tenantId`, `model_name`)
- **Note:** These metrics will be sourced directly from the AI Gateway's analytics features where possible to ensure accuracy.

### 3.3 RAG & Storage Metrics
- `vectorize_queries_total`: Counter for queries to Vectorize. (Labels: `tenantId`, `status`)
- `vectorize_latency_ms_histogram`: Histogram of latency for Vectorize search operations. (Labels: `tenantId`)
- `cache_hit_rate`: A gauge or counter pair (`cache_hits_total`, `cache_misses_total`) for KV and other caches. (Labels: `tenantId`, `cache_name`)
- `rag_citations_total`: Counter for the number of source citations returned in RAG responses. (Labels: `tenantId`)
- `rag_quality_score`: A gauge representing the "smoke score" from the retrieval quality regression suite.

### 3.4 Durable Object & D1 Metrics
- `durable_object_invocations_total`: Counter for DO method calls. (Labels: `tenantId`, `className`, `methodName`, `status`)
- `durable_object_cpu_time_ms_histogram`: Histogram of DO CPU time. (Labels: `tenantId`, `className`)
- `d1_queries_total`: Counter for D1 database queries. (Labels: `tenantId`, `status`)
- `d1_query_latency_ms_histogram`: Histogram of D1 query latency. (Labels: `tenantId`)

## 4. Tracing
Full distributed tracing may not be available. We will emulate it using a correlation ID.
- A `requestId` will be generated at the start of each request or, preferably, read from an incoming `cf-ray` or `X-Request-ID` header.
- This `requestId` will be included in all structured logs.
- This `requestId` will be passed in metadata to the AI Gateway to correlate AI calls with specific API requests.

## 5. Dashboards & Alerts

### 5.1 Dashboard Suggestions
A primary monitoring dashboard should visualize:
- **API Health:** Request rate, error rate (by route), and P95/P99 latency.
- **Cost Monitoring:** Total prompt and completion tokens, broken down by `tenantId` and `model_name`.
- **RAG Performance:** Vectorize query latency and cache hit rate.
- **Tenant Usage:** Top tenants by request volume and token usage.

### 5.2 Alert Suggestions
Automated alerts should be configured for:
- **High Error Rate:** A sustained spike in `errors_total` or HTTP 5xx status codes.
- **High Latency:** P99 latency exceeding a defined threshold (e.g., > 3s).
- **AI Gateway Errors:** A spike in errors when calling `env.AI.run()`.
- **Budget Overrun (Future):** When a tenant approaches their configured token budget (requires budget tracking implementation).
- **High DO CPU Time:** Durable Object CPU time exceeding a threshold, indicating a hot spot.
- **High D1 Query Latency:** D1 queries taking longer than expected.
- **Critical Test Failure:** A failure in the retrieval quality regression suite.