# M4 Notes & Implementation Details

**Date:** 2026-02-07  
**Milestone:** M4 — AI Search UX Endpoint + Repository Cleanup

---

## Search Endpoint Implementation Notes

### Caching Strategy
- **Cache TTL:** 24 hours (86,400 seconds)
- **Tenant Isolation:** Cache keys prefixed with tenantId
- **Cache Key Format:** `${tenantId}:search:${sha256(rewrittenQuery)}`
- **Scope:** KV namespace `CACHE`, shared across tenants with prefix isolation
- **Hit Rate:** Expected 5-10x latency improvement on cache hits

### Metrics Keys
- **Search Latency:** `${tenantId}:search:metrics:${timestamp}` (TTL 7 days)
- **Cache Stats:** `${tenantId}:search:cache-stats:${timestamp}` (TTL 7 days)
- **Tracking:** Per-phase breakdown (rewrite, embed, retrieve, rag, generate)

### Query Rewriting
- **Timeout:** 1 second (fallback to original query if timeout)
- **Intent Detection:** AI-driven query expansion and normalization
- **Cache Key Format:** Normalized (lowercase + trimmed) for consistency
- **Special Characters:** Handled via sha256 hashing in cache key

### Follow-Up Generation
- **Limit:** 5 items maximum per response
- **Type:** Suggestions for user's next query
- **Implementation:** Generated as part of RAG assembly pipeline

---

## Issue Dependency Graph (#46-#53)

```
DEPENDENCIES GRAPH
══════════════════

#47: Output Schema (Root dependency)
├─ Zod schema + types for SearchResponse
├─ answer: string (required)
├─ sources: Citation[] (required)
├─ confidence: 0-1 (required, numeric)
├─ followUps: string[] (required, max 5)
└─ All #46-#53 depend on this

#48: Query Rewriting (Input processing)
├─ Intent detection
├─ Query expansion/normalization
├─ Timeout fallback (1s max)
└─ Output feeds cache key in #49

#49: Search Cache (Performance layer)
├─ KV storage with tenant scoping
├─ Cache key: ${tenantId}:search:${sha256(rewrittenQuery)}
├─ TTL: 24 hours
├─ getCachedSearch / setCachedSearch
├─ Triggers #50-#51 metrics
└─ Feeds cache hits to hit rate aggregation

#46: /search Handler (Orchestrator)
├─ Input: SearchRequest (tenant, query, ...)
├─ Step 1: #48 → rewrite query
├─ Step 2: #49 → check cache (cache hit paths)
├─ Step 3: M3 → embed, retrieve, assemble RAG
├─ Step 4: Generate follow-ups
├─ Step 5: #50 → track latency
├─ Step 6: #51 → track cache rate
├─ Output: SearchResponse (#47)
└─ All steps must complete within timeout

#50: Search Latency Metrics (Observability)
├─ Per-phase timing:
│  ├─ Rewrite latency (from #48)
│  ├─ Cache check latency (from #49)
│  ├─ Embedding latency (from M3)
│  ├─ Retrieval latency (from M3)
│  ├─ RAG assembly latency (from M3)
│  └─ Follow-up generation latency
├─ KV storage: ${tenantId}:search:metrics:${timestamp}
├─ TTL: 7 days (rolling window)
└─ Aggregation: P50/P95/P99 per phase

#51: Cache Hit Rate Metrics (Performance tracking)
├─ Aggregation per tenant:
│  ├─ totalSearches (all queries)
│  ├─ hits (cache hits)
│  ├─ misses (cache misses)
│  └─ hitRate (hits / totalSearches)
├─ KV: ${tenantId}:search:cache-stats:${timestamp}
├─ Comparison: cached vs uncached P95 latency
├─ Feeds /metrics/search-cache endpoint
└─ TTL: 7 days

#52: Schema Validation Tests
├─ Input validation: SearchRequest schema
├─ Output validation: SearchResponse schema
├─ Citation validation: Vectorize metadata tracing
├─ 11 test cases covering edge cases
└─ See tests/search-schema-validation.test.ts

#53: Caching Behavior Tests
├─ Cache write and read (same tenant)
├─ Cache isolation by tenantId
├─ Cache TTL enforcement (expires after 24h)
├─ Cache miss on expired entries
├─ Cache key normalization
├─ Concurrent access (same query, different tenants)
├─ Cache updates with new response
├─ Large response caching (10KB+)
├─ Special character handling
├─ Metrics aggregation (cache hits per tenant)
└─ 10 test cases (see tests/search-caching.test.ts)
```

---

## Implementation Checklist

### Core Components
- ✅ `SearchResponse` Zod schema (packages/rag/src/search-schema.ts)
- ✅ Query rewriting pipeline (packages/rag/src/query-rewriting.ts)
- ✅ Search cache layer (packages/storage/src/search-cache.ts)
- ✅ `/search` endpoint handler (apps/worker-api/src/index.ts)
- ✅ Latency metrics tracking (packages/observability/src/metrics.ts)
- ✅ Cache hit rate aggregation (packages/observability/src/cache-metrics.ts)

### Testing
- ✅ Schema validation tests (tests/search-schema-validation.test.ts)
- ✅ Caching behavior tests (tests/search-caching.test.ts)
- ✅ Integration tests with full pipeline
- ✅ Edge case coverage

### Documentation
- ✅ API documentation (docs/guides/)
- ✅ Implementation guide (this document + PLAN.md)
- ✅ Deployment guide (DEPLOYMENT.md)

---

## Known Limitations & Workarounds

### Limitation 1: Query Timeout
**Issue:** Query rewriting may exceed 1s timeout for very complex queries  
**Workaround:** Timeout fallback returns original query  
**Impact:** Cache hit rate may be lower for complex queries  
**Mitigation:** Aggressive caching + precomputed rewrites for common queries

### Limitation 2: Cache Key Collision
**Issue:** sha256(rewrittenQuery) could theoretically collide  
**Probability:** Negligible (2^-128 for different inputs)  
**Mitigation:** Monitor cache hit rate for anomalies

### Limitation 3: Metrics Storage
**Issue:** Storing per-query metrics could exceed KV quota at scale  
**Workaround:** Metrics TTL 7 days, aggregated per tenant  
**Mitigation:** Archive old metrics to D1 if storage pressure detected

---

## Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Query rewrite latency (P95) | < 1s | ✅ Verified |
| Cache hit latency | < 100ms | ✅ Expected |
| Cache hit latency vs miss | 5-10x improvement | ✅ Expected |
| Full search latency (P95) | < 5s | ✅ Expected |
| Cache miss latency (full pipeline) | < 10s | ✅ Expected |

---

## Repository Cleanup Notes

### Phase 3: Milestone Structure

**Before:**
```
docs/
├── M0-COMPLETE.md
├── M1-PREP.md
├── M2-PREP.md
├── M3-PREP.md
├── M4-PREP.md
├── M4-CODEX-PLAN.md
├── M4-COMPLETION-ROLLUP.md
├── M4-STAGING-VALIDATION-RESULTS.md
├── M4-STAGING-DEPLOYMENT.md
├── M4-NOTES.md
├── M4-ISSUES-QUICK-REF.md
├── M4-PR-SUMMARY.md
├── M4-REPO-CLEANUP-PLAN.md
├── M5-PREP.md
├── PR.md
├── PR-SUMMARY.md
├── handoff-M0.md
├── handoff-M1.md
├── handoff-M2.md
├── handoff-M3.md
├── handoff-PR.md
└── ...
```

**After:**
```
docs/
├── archive/
│  └── milestones/
│     ├── M0/
│     │  ├── COMPLETE.md
│     │  └── handoff.md
│     ├── M1/
│     │  ├── PREP.md
│     │  └── handoff.md
│     ├── M2/
│     │  ├── PREP.md
│     │  └── handoff.md
│     ├── M3/
│     │  ├── PREP.md
│     │  └── handoff.md
│     ├── PR.md
│     ├── PR-SUMMARY.md
│     └── handoff-PR.md
├── milestones/
│  ├── M4/
│  │  ├── PLAN.md (consolidated)
│  │  ├── STATUS.md (consolidated)
│  │  ├── NOTES.md (consolidated)
│  │  ├── DEPLOYMENT.md
│  │  ├── REPO-CLEANUP.md
│  │  ├── PR-SUMMARY.md
│  │  └── M4-CODEX-PLAN.md (moved here)
│  └── M5/
│     └── PREP.md
└── ...
```

**Consolidation Rules:**
- PLAN.md: M4-PREP + M4-CODEX-PLAN
- STATUS.md: M4-COMPLETION-ROLLUP + M4-STAGING-VALIDATION-RESULTS
- NOTES.md: M4-NOTES + M4-ISSUES-QUICK-REF

---

## Future Milestone Pattern

For M5 and beyond:
```
docs/milestones/M{N}/
├── PLAN.md          ← Scope, objectives, risks
├── STATUS.md        ← Completion, test results, validation
├── NOTES.md         ← Implementation details, issues, graph
├── DEPLOYMENT.md    ← Deployment procedures
├── PR-SUMMARY.md    ← Pull request summary (if applicable)
└── [other docs]     ← Phase or issue-specific details
```

---

## See Also

- [M4 Plan](./PLAN.md) — Objectives and deliverables
- [M4 Status](./STATUS.md) — Completion and test results
- [M4 Deployment](./DEPLOYMENT.md) — Deployment procedures
- [Repository Cleanup](./REPO-CLEANUP.md) — Full cleanup reference
