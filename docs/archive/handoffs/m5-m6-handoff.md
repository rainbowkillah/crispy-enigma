# M5+M6 Handoff: Tools, TTS, and Observability Prep

**Date:** February 8, 2026
**Status:** M5 Complete, M6 Complete, Ready for M7

---

## 1. M5 Review (Tools & Functions) — Completed by Claude

**Status:** ✅ Complete
**Issues:** #54-#66
**Tests:** 59 new tests added (Total: 165 passing)

### Capabilities Delivered
- **Tool Dispatcher:** Registry-based execution with permission gating (`default-deny`).
- **5 Built-in Tools:**
  - `summarize`: Text summarization.
  - `extract_entities`: Named entity extraction.
  - `classify_intent`: Intent classification.
  - `tag_chunk_docs`: Parallel document chunking & tagging.
  - `ingest_docs`: Full RAG pipeline (chunk → embed → upsert).
- **Security:**
  - Permission model requiring explicit tenant feature flags.
  - Audit logging of all tool executions (SHA-256 hashed params).
  - Injection guards for path traversal and proto pollution.

### Key Files
- `packages/tools/src/dispatcher.ts`
- `packages/tools/src/permissions.ts`
- `packages/tools/src/audit.ts`
- `packages/tools/src/metrics.ts`

### Known Limitations
- **Recursive Validation:** Parameter validation is shallow; nested objects are not validated against schema.
- **Analytics:** KV-backed metrics are sufficient for current scale but will need migration to Cloudflare Analytics Engine for high volume.
- **Streaming:** Tool results are currently non-streaming.

---

## 2. M6 Review (TTS Adapter Boundary) — Completed by Gemini

**Status:** ✅ Complete
**Issues:** #67-#73
**Tests:** 12 new tests (Total at M6: 177 passing)

### Capabilities Delivered
- **Standardized Interface:** `TtsAdapter` interface to decouple API from providers.
- **Stub Implementation:** Default `StubTtsAdapter` that safely handles requests when no provider is configured.
- **API Endpoint:** `POST /tts` with validation, feature flagging, and standardized error handling.
- **Feature Flag:** `tts_enabled` flag required in tenant config to access the endpoint.

### New Files
- `packages/tts/src/schema.ts`: Zod schemas for request/response.
- `packages/tts/src/adapter.ts`: Provider interface definition.
- `packages/tts/src/stub.ts`: Placeholder implementation.
- `packages/tts/src/index.ts`: Package exports.
- `docs/tts-contracts.md`: API and interface documentation.

### Quality Assessment
- **Contract Definition:** Clear separation between the HTTP layer (`apps/worker-api`) and the provider logic (`packages/tts`).
- **Test Coverage:**
  - `tests/tts-schema.test.ts`: Validates input constraints (length, format, speed).
  - `tests/tts-stub.test.ts`: Verifies stub behavior (throws expected errors).
  - `tests/tts-endpoint.test.ts`: Tests integration, including `403` when disabled and `500` when provider fails/is missing.
- **Extensibility:** Ready for an ElevenLabs or OpenAI adapter implementation in a future milestone without changing the API contract.

---

## 3. Post-M6 Enhancements

**Status:** ✅ Complete
**Context:** Rate limiting improvements applied after M6 core work.

### Changes
- **Burst Enforcement:** Wired up the existing `burst` config field (previously defined but unused) with a second sliding window check in the Durable Object.
- **Configurable Windows:** Added `windowSec` (default 60) and `burstWindowSec` (default windowSec/6) to tenant config. No longer hardcoded.
- **4 new tests** (Total: 181 passing across 38 files)
- **Files Modified:**
  - `packages/core/src/tenant/types.ts` — Added `windowSec?`, `burstWindowSec?`
  - `packages/core/src/tenant/schema.ts` — Zod validation for new fields
  - `apps/worker-api/src/rate-limiter-do.ts` — Dual sliding window (sustained + burst)
  - `apps/worker-api/src/index.ts` — Passes burst config to DO
  - `tests/rate-limiter.test.ts` — 3 new unit tests
  - `tests/rate-limit.test.ts` — 1 new integration test

---

## 4. M7 Readiness (Observability & QA Gates)

**Goal:** Turn ad-hoc logging into a production-grade observability suite and harden the CI pipeline.

### Current State (Gap Analysis)
- **Logging:** Scattered `console.log` and `console.error` calls. No unified structured logging schema.
- **Metrics:**
  - Ad-hoc KV-based metrics in `packages/tools/src/metrics.ts` and `apps/worker-api`.
  - No unified `Metrics` interface or adapter.
  - No connection to Cloudflare Analytics Engine.
- **Tracing:** `traceId` is propagated in headers, but not consistently used in all logs or internal calls.
- **CI/CD:** Basic tests run, but no strict quality gates for linting, type-checking, or coverage thresholds in CI.

### M7 Issues (#74-#85)
| Issue | Deliverable |
|-------|-------------|
| #74 | Finalize logging schema with required fields |
| #75 | Define correlation IDs and tracing strategy |
| #76 | Implement metrics helpers |
| #77 | Implement required metrics |
| #78 | Add cost monitoring metrics (token usage) |
| #79 | Create dashboards/alerts suggestions document |
| #80 | Create load test scripts |
| #81 | Create retrieval quality 'smoke score' regression suite |
| #82 | Create streaming stability tests |
| #83 | Set up CI gates (lint, typecheck, unit, integration) |
| #84 | Document failure mode template |
| #85 | Document external dependency failure strategies |

### M7 Plan
1.  **Unified Logging (#74, #75):**
    - Create `packages/observability/src/logger.ts` with strict schema (`tenantId`, `traceId`, `level`, `event`, `meta`).
    - Replace all `console.*` usage with this logger.
2.  **Metrics Architecture (#76, #77, #78):**
    - Standardize on a metrics interface in `packages/observability`.
    - Implement adapters for KV (dev/low-volume) and Analytics Engine (prod).
    - Migrate existing tool/search metrics to this system.
    - Token usage tracking (input/output) mapped to cost per model.
3.  **QA & Testing (#80, #81, #82, #83):**
    - Load test scripts (k6 or similar) for core endpoints.
    - Retrieval quality regression suite.
    - Streaming stability tests.
    - Enforce `lint`, `typecheck`, and `test` in CI pipelines.
4.  **Documentation (#79, #84, #85):**
    - Dashboards/alerts suggestions document.
    - Failure mode template.
    - External dependency failure strategies.

### Key Decisions for M7
- **Sink:** Will we primarily use Cloudflare Analytics Engine or a third-party (Datadog/BetterStack)? *Recommendation: Analytics Engine for metrics, internal KV/Logpush for logs initially to keep dependencies low.*
- **Sampling:** Should we sample traces in high-volume tenants? *Decision: Keep 100% for now, introduce sampling if cost/performance becomes an issue.*

---

## Acceptance Criteria for M7

- [ ] **Structured Logs:** All logs must be JSON objects with `traceId`, `tenantId`, `timestamp`, and `level`.
- [ ] **Unified Metrics:** A single `Metrics` class handles recording latency, errors, and custom counters.
- [ ] **Cost Visibility:** API exists to query estimated cost per tenant.
- [ ] **Load Tests:** Scripts exist to stress test `POST /chat` and `POST /search` at 100 RPS.
- [ ] **CI Gates:** PRs cannot merge without passing lint, typecheck, and unit tests.
