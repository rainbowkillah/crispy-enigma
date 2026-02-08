# External Dependency Failure Strategies

We rely on several Cloudflare services. Here is how we handle their failures.

## 1. Workers AI (Inference)

- **Dependency:** `env.AI` binding or AI Gateway.
- **Failure:** 500s, timeouts, rate limits.
- **Strategy:**
  - **Fallbacks:** Configure `FALLBACK_MODEL_ID` to use a different model (e.g., Llama 2 instead of 3).
  - **Retries:** AI Gateway handles retries.
  - **Degradation:** If chat fails, return "Service unavailable" but allow history read.

## 2. Vectorize (Search)

- **Dependency:** `env.VECTORIZE`.
- **Failure:** Query timeout, index unavailable.
- **Strategy:**
  - **Circuit Breaker:** Stop querying if error rate > 50%.
  - **Fallback:** Return empty results or keyword search if available.
  - **Ingest:** Queue vectors in R2/D1 if Vectorize is down (future work). Currently fails ingestion.

## 3. KV (Config & Cache)

- **Dependency:** `env.CONFIG`, `env.CACHE`.
- **Failure:** Read/Write errors.
- **Strategy:**
  - **Config:** Use hardcoded defaults for critical flags.
  - **Cache:** Treat as cache miss (fail open). Log warning but proceed.
  - **Metrics:** Metrics data loss is acceptable.

## 4. Durable Objects (State)

- **Dependency:** `CHAT_SESSION`, `RATE_LIMITER_DO`.
- **Failure:** Unreachable, overload.
- **Strategy:**
  - **Sessions:** Fail request. Consistency is critical.
  - **Rate Limiter:** Fail OPEN. Allow traffic if limiter is down, to avoid blocking legitimate users during outage.
