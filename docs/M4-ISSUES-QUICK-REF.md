# M4 Issues Quick Reference

**Issues #46-#53 | Milestone M4 — AI Search UX Endpoint**

```
DEPENDENCIES GRAPH
══════════════════

#47: Output Schema          (#46-#53 depend on this)
├─ Zod schema + types
├─ answer: string
├─ sources: Citation[]
├─ confidence: 0-1
└─ followUps: string[]

#48: Query Rewriting         (goes into #46 pipeline)
├─ Intent detection
├─ Query expansion/normalization
└─ Cache key in #49

#49: Search Cache            (feeds #46, triggers #50-#51)
├─ KV storage with tenant scoping
├─ TTL: 24h
├─ getCachedSearch / setCachedSearch
└─ Metrics: hits, misses, TTL tracking

#46: /search Handler         (orchestrates all)
├─ Input: SearchRequest
├─ #48→ rewrite query
├─ #49→ check cache
├─ M3→ embed, retrieve, assemble
├─ →follow-ups generation
├─ #50→ track latency
├─ #51→ track cache rate
└─ Output: SearchResponse (#47)

#50: Search Latency Metrics  (#46 emits)
├─ Per-phase timing (rewrite, embed, retrieve, rag, gen)
├─ KV storage: ${tenantId}:search:metrics:*
└─ Rolling 24h window

#51: Cache Hit Metrics       (#49 & #46 feed)
├─ Aggregation: totalSearches, hits, misses, hitRate
├─ KV: ${tenantId}:search:cache-stats:*
└─ Comparison: cached vs uncached P95 latency

#52: Schema Validation Tests
├─ Input: SearchRequest validation
├─ Output: SearchResponse validation
└─ Citation→Vectorize metadata tracing

#53: Cache Behavior Tests
├─ Hit/miss paths
├─ TTL expiry
├─ Tenant isolation
└─ Metrics accuracy
```

## Implementation Order

**Phase 1 (Foundation)**: #47 → #48 → #49  
**Phase 2 (Integration)**: #46 with (#50, #51)  
**Phase 3 (Testing)**: #52 → #53  

## File Changes Summary

| File | Change | Issue |
|------|--------|-------|
| `packages/core/src/rag/schema.ts` | Add `searchResponseSchema` + type | #47 |
| `packages/rag/src/query-rewriting.ts` | **NEW** Intent detection + rewrite | #48 |
| `packages/storage/src/search-cache.ts` | **NEW** KV cache get/set | #49 |
| `apps/worker-api/src/index.ts` | Wire `/search` handler L645-707 | #46 |
| `apps/worker-api/src/index.ts` | Add `SearchMetrics` type & emission | #50–#51 |
| `tests/search-schema-validation.test.ts` | **NEW** Schema tests | #52 |
| `tests/search-caching.test.ts` | **NEW** Cache tests | #53 |

## Current State vs M4

**M3 Delivered** ✅
- Chunking, embeddings, Vectorize retrieval
- RAG assembly with citations
- Safety filters
- `/ingest` and `/search` basic wiring

**M4 Adds**
- Structured output schema (not just prompt + citations)
- Query intelligence (rewriting, intent detection)
- Performance optimization (KV caching)
- Observability (latency, cache metrics)
- Comprehensive test coverage

## Acceptance Criteria (from M4-PREP.md)

✅ `/search` returns stable, structured JSON (SearchResponse)  
✅ Citations trace back to Vectorize metadata  
✅ Cache hit reduces P95 latency demonstrably  
✅ Metrics `search_latency_ms` and `search_cache_hit_rate` emitted  
✅ Vectorize top-K limit (20 with metadata) respected  

## Codex Prompt Template

```
Implement M4 Issue #XX:
[Description of what needs to be done]

Reference implementation plan: /home/dfox/projects-cf/crispy-enigma/docs/M4-CODEX-PLAN.md

Key constraints:
- Follow tenant scoping pattern: ALL keys use ${tenantId}:* prefix
- Use existing SearchRequest schema (packages/core/src/rag/schema.ts)
- Response envelope from packages/core/src/responses.ts
- Emit metrics type SearchMetrics to KV or stdout
- Match existing test patterns in tests/*.test.ts

Expected file locations:
- Schema: packages/core/src/rag/schema.ts
- Query rewriting: packages/rag/src/query-rewriting.ts
- Cache: packages/storage/src/search-cache.ts
- Tests: tests/search-*.test.ts
```

---

**For full details**, see [M4-CODEX-PLAN.md](./M4-CODEX-PLAN.md)
