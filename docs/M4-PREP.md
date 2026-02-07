# M4 Preparation Report

**Report Date:** 2026-02-07
**Status:** Draft
**Milestone:** M4 — AI Search UX Endpoint

---

## Objective

Prepare the scope, risks, and validation plan for M4. This milestone focuses on building a dedicated `/search` endpoint tuned for a rich RAG (Retrieval-Augmented Generation) user experience. Key features include a structured response format, query understanding capabilities, and a tenant-scoped caching layer to optimize performance.

---

## Dependencies / Blockers

- **M3 (Embeddings + Vectorize + RAG):** ✅ Complete. The core retrieval pipeline required for M4 is in place.
- **Blockers:** None.

---

## Proposed Deliverables (M4)

- A new `/search` endpoint with a stable, versioned output schema.
- A defined output schema including `answer`, `sources` (with citations), `confidence`, and suggested `follow-up` questions.
- Lightweight query rewriting and intent detection to improve retrieval accuracy.
- A tenant-scoped caching strategy using KV for frequently asked questions.
- New metrics specifically for search latency and cache hit rate.
- Comprehensive tests for schema validation and caching logic.

---

## Prep Checklist (from Project Board)

- [ ] #46 Build /search endpoint with output schema
- [ ] #47 Define output schema: answer + sources + confidence + follow-ups
- [ ] #48 Implement query rewriting / intent detection
- [ ] #49 Implement caching for common queries (tenant-scoped KV)
- [ ] #50 Add search latency metrics
- [ ] #51 Add cache hit rate metrics
- [ ] #52 Create schema validation tests
- [ ] #53 Create caching behavior tests

---

## Risks

- **Latency:** The end-to-end latency of the `/search` endpoint (query embed → retrieve → assemble → generate) may be too high for an interactive UX without effective caching.
- **Quality:** The quality of query rewriting and generated follow-up questions may be inconsistent and require significant prompt engineering and iteration.
- **Schema Stability:** The structured output must be stable and reliable for downstream clients to consume.

---

## Acceptance Criteria (Draft)

- The `/search` endpoint returns a stable, structured JSON object containing `answer`, `sources`, and `confidence` fields.
- Citations within the `sources` array trace back directly to the original Vectorize metadata.
- A cache hit for a repeated query demonstrably reduces P95 latency.
- `search_latency_ms` and `search_cache_hit_rate` metrics are successfully emitted.
- The search pipeline respects the Vectorize top-K limit of 20 (with metadata) before the RAG assembly step.