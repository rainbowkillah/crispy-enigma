# M4 Implementation Plan for Codex
**Status:** Ready for Implementation  
**Date:** 2026-02-07  
**Milestone:** M4 — AI Search UX Endpoint

---

## 📋 Executive Summary

M4 completes the RAG search UX by building a dedicated `/search` endpoint with:
- **Structured output schema** (answer, sources, confidence, follow-ups)
- **Query intelligence** (rewriting, intent detection)
- **Performance optimization** (tenant-scoped KV caching)
- **Observability** (latency & cache hit rate metrics)
- **Full test coverage** (schema validation & caching behavior)

**Foundation in place:** M3 delivered the core RAG pipeline (chunking, embeddings, Vectorize retrieval, RAG assembly). M4 builds the user-facing API and optimization layer on top.

---

## 🎯 Issue Breakdown (#46-#53)

### Issue #46: Build /search endpoint with output schema
**Scope:** Create the HTTP handler for `/search` that orchestrates the full search pipeline  
**Current State:** RAG assembly returns unstructured prompt + citations; no search latency tracking; no follow-up generation  
**Dependencies:**  
- M3 RAG assembly complete ✅
- Issue #47 (output schema definition)  

**Deliverables:**
- Router handler in `apps/worker-api/src/index.ts` (search handler function)
- Request validation against `SearchRequest` (already exists)
- Orchestration: query rewriting → embedding → retrieval → assembly → LLM call → response generation
- Integration with results from #50-#51 (metrics emission)

**Key Code Paths:**
- Entry: Line 645-707 in `apps/worker-api/src/index.ts` (existing stub)
- Output: Response envelope following `fail()`/`ok()` pattern with structured `SearchResponse`

---

### Issue #47: Define output schema: answer + sources + confidence + follow-ups
**Scope:** Zod schema for SearchResponse with typed fields  
**Current State:** Current `/search` returns unstructured RAG prompt + citations array  
**Dependencies:**  
- Issue #46 (will use this schema)
- `RagCitation` type from `packages/rag/src/rag.ts` (line 26-32)

**Deliverables:**
Create `packages/core/src/rag/schema.ts` export (append to existing file):
```typescript
export const searchResponseSchema = z.object({
  status: z.literal('ok'),
  traceId: z.string().optional(),
  answer: z.string().describe('Generated answer from RAG LLM'),
  sources: z.array(z.object({
    id: z.string(),
    docId: z.string(),
    chunkId: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
    source: z.string().optional(),
    text: z.string().describe('Direct quote from source'),
    score: z.number().min(0).max(1).optional()
  })).describe('Cited sources with confidence scoring'),
  confidence: z.number().min(0).max(1).describe('Overall answer confidence (0-1)'),
  followUps: z.array(z.string()).min(0).max(5).describe('Suggested follow-up questions')
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
```

**Acceptance:** Schema validates real search responses; citations trace back to Vectorize metadata

---

### Issue #48: Implement query rewriting / intent detection
**Scope:** Pre-process user query to improve retrieval accuracy  
**Current State:** Query used directly without transformation  
**Dependencies:**  
- AI Gateway embeddings available ✅
- Issue #46 (will call this before embedding)

**Deliverables:**
Create `packages/rag/src/query-rewriting.ts`:
```typescript
export async function detectQueryIntent(
  tenantId: string,
  gatewayId: string,
  query: string,
  env: Env
): Promise<{ intent: string; rewritten: string }>

export async function rewriteQuery(
  tenantId: string,
  gatewayId: string,
  originalQuery: string,
  env: Env
): Promise<string>
```

**Implementation Details:**
- Use light LLM call (e.g., `@cf/meta/llama-2-7b-chat-int8` with short prompt)
- Intent categories: `question`, `statement`, `command`, `clarification`
- Rewritten query: expanded with synonyms or clarification context
- Cache rewriting results in KV for 24h (issue #49)

**Example Rewrite:**
- Input: "how do workers work"
- Intent: `question`
- Rewritten: "Explain Cloudflare Workers architecture and execution model"

---

### Issue #49: Implement caching for common queries (tenant-scoped KV)
**Scope:** Tenant-scoped KV cache for full search results  
**Current State:** No caching layer  
**Dependencies:**  
- Issue #47 (need structured response to cache)
- Issue #48 (cache on rewritten query, not original)
- KV binding in `Env` ✅

**Deliverables:**
Create `packages/storage/src/search-cache.ts`:
```typescript
export async function getCachedSearch(
  tenantId: string,
  query: string,
  env: Env
): Promise<SearchResponse | null>

export async function setCachedSearch(
  tenantId: string,
  query: string,
  response: SearchResponse,
  ttlSeconds: number,
  env: Env
): Promise<void>
```

**Cache Strategy:**
- Key format: `${tenantId}:search:${hash(rewrittenQuery)}`
- TTL: 24 hours (86400s)
- Metadata: `{ docCount: number, timestamp: number }`
- Eviction: LRU implicit via KV TTL
- Maximum cache size per tenant: 1000 queries (soft limit; no enforcement needed)

**Metrics:** Track cache hits/misses in #50-#51

---

### Issue #50: Add search latency metrics
**Scope:** Emit structured telemetry for search pipeline phases  
**Current State:** Token usage metrics exist (line 42-52 in `index.ts`); no search latency  
**Dependencies:**  
- `packages/observability` logging infrastructure ✅
- Issue #46 (search handler will emit these)

**Deliverables:**
Extend `UsageMetrics` type in `apps/worker-api/src/index.ts`:
```typescript
type SearchMetrics = {
  tenantId: string;
  traceId?: string;
  route: 'search';
  status: 'success' | 'error' | 'cache-hit';
  cacheHit: boolean;
  latencies: {
    totalMs: number;
    rewriteMs?: number;
    embeddingMs?: number;
    retrievalMs?: number;
    ragAssemblyMs?: number;
    generationMs?: number;    // LLM call for follow-ups
  };
  tokensUsed?: {
    rewrite?: { in: number; out: number };
    followUpGeneration?: { in: number; out: number };
  };
  topK: number;
  matchesReturned: number;
};
```

**Emission:** Store in KV under `${tenantId}:search:metrics:${timestamp}` or log to stdout (TBD in env config)

---

### Issue #51: Add cache hit rate metrics
**Scope:** Track search cache effectiveness  
**Current State:** No cache stats  
**Dependencies:**  
- Issue #49 (cache implementation)
- Issue #50 (metrics infrastructure)

**Deliverables:**
Extend search metrics in `packages/observability`:
```typescript
type SearchCacheMetrics = {
  tenantId: string;
  period: '1h' | '24h' | '7d';  // aggregation window
  totalSearches: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;  // 0-1
  latencyImprovement: number;  // P95 cached vs uncached in ms
  topCachedQueries: Array<{ query: string; hits: number }>;
};
```

**Calculation:**
- Emit atomic event: `search_cache_check` with `hit: boolean`
- Aggregate in KV or external metrics sink (22h rolling window)
- P50/P95 latency comparison: cached responses avg 50-100ms vs uncached 300-1000ms

---

### Issue #52: Create schema validation tests
**Scope:** Unit tests for Input/Output schema conformance  
**Current State:** Input schema tests exist (e.g., `vitest.config.ts`); output schema untested  
**Dependencies:**  
- Issue #47 (schema definition)
- Vitest setup ✅

**Deliverables:**
Create `tests/search-schema-validation.test.ts`:
```typescript
describe('Search Schema Validation', () => {
  // Input validation
  it('rejects invalid query (empty/too long)', () => {...})
  it('accepts valid topK override', () => {...})
  it('accepts optional filter metadata', () => {...})

  // Output validation
  it('enforces answer is non-empty string', () => {...})
  it('enforces sources array with required fields', () => {...})
  it('enforces confidence score 0-1', () => {...})
  it('enforces follow-ups max length 5', () => {...})
  it('rejects malformed citations (missing docId)', () => {...})
  it('trace citations back to Vectorize metadata', () => {...})

  // Round-trip
  it('real search response parses against SearchResponse', () => {...})
})
```

**Coverage Target:** 100% schema paths

---

### Issue #53: Create caching behavior tests
**Scope:** Integration tests for cache hit/miss logic and TTL  
**Current State:** No cache tests  
**Dependencies:**  
- Issue #49 (cache implementation)
- Vitest & mock KV setup ✅

**Deliverables:**
Create `tests/search-caching.test.ts`:
```typescript
describe('Search Caching', () => {
  it('returns cached response on hit with <50ms latency', () => {...})
  it('populates cache on first query miss', () => {...})
  it('cache key includes tenant isolation boundary', () => {...})
  it('expires cache after 24h TTL', () => {...})
  it('separate cache per tenant (no cross-tenant bleed)', () => {...})
  it('metrics accurately track hit rate over 100 requests', () => {...})
  it('rewritten query used as cache key (not original)', () => {...})
  it('distinguishes cache-hit in latency metrics', () => {...})
})
```

**Coverage Target:** Cache hit/miss paths, TTL boundary, tenant isolation

---

## 🏗️ Architecture Decisions Locked In

### Output Response Envelope
All `/search` responses follow the standard envelope (from `packages/core/src/responses.ts`):
```typescript
{
  status: 'ok' | 'error',
  traceId: string,
  data?: SearchResponse,
  error?: { code: string; message: string }
}
```

### Query Rewriting Flow
```
User Query
  ↓
[Intent Detection (LLM call)]
  ↓
Rewritten Query + Intent
  ↓
[Check Cache #49]
  ↓ (miss)
[Embedding (M3)]
  ↓
[Vectorize Retrieval (M3)]
  ↓
[RAG Assembly (M3)]
  ↓
[Follow-up Generation (LLM call)]
  ↓
[Cache Write #49]
  ↓
SearchResponse
```

### Tenant Scoping
- All KV keys: `${tenantId}:search:*`
- Cache buckets per tenant (no sharing)
- Metrics tagged with `tenantId`

### Model Selection
- **Rewrite intent:** `env.MODEL_ID ?? config.aiModels.chat` (fast, 7B-scale)
- **Follow-ups:** `env.MODEL_ID ?? config.aiModels.chat` (same)
- **Embeddings & RAG:** Existing M3 config, unchanged

---

## 🧪 Testing Strategy

### Unit Tests (Issues #52-#53)
- Schema validation: 25 test cases
- Cache behavior: 12 test cases
- Total unit coverage: 80%+ lines in new files

### Integration Tests
- End-to-end `/search` flow with mock embeddings/Vectorize
- Cache population + TTL expiry
- Metrics emission

### Manual Validation (Staging)
- Live Vectorize index query
- Actual AI Gateway latencies
- Real cache hit rates over 1 hour

---

## 🚀 Implementation Sequence

### Phase 1: Foundation (Issues #47-#49)
1. **#47** Define SearchResponse schema + types
2. **#48** Implement query rewriting/intent detection
3. **#49** Build search cache storage layer

### Phase 2: Endpoint (Issues #46, #50-#51)
4. **#46** Wire `/search` handler with full pipeline
5. **#50** Emit search latency metrics
6. **#51** Aggregate cache hit rate metrics

### Phase 3: Testing (Issues #52-#53)
7. **#52** Schema validation tests
8. **#53** Cache behavior tests

---

## 📊 Success Criteria

| Criterion | Target | Validation |
|-----------|--------|-----------|
| Schema stability | 100% of responses validate against SearchResponse | `npm test tests/search-schema*` |
| Cache hit rate | ≥60% for identical repeat queries within 24h | Metrics aggregation in KV |
| P95 latency improvement | Cached: <150ms, Uncached: <1000ms | Latency metrics tracking |
| Tenant isolation | Zero cross-tenant cache/metric leakage | `npm test tests/search-caching` isolation test |
| Citation accuracy | All sources trace to Vectorize metadata | Manual spot-check + deterministic fixture test |

---

## ⚠️ Known Risks & Mitigations

### Risk: Query rewriting fails
**Impact:** Fallback to original query  
**Mitigation:** Wrap LLM call in try/catch; log failures; use original query on timeout

### Risk: Cache hits cause stale answers for rapidly changing docs
**Impact:** User sees outdated info  
**Mitigation:** Document 24h TTL in API docs; provide cache invalidation hook (out of scope for M4)

### Risk: Follow-up question LLM calls add 300-500ms latency
**Impact:** Total search latency 1-2s vs target <1s  
**Mitigation:** Implement answer-only mode (skip follow-ups) via optional `skipFollowups: boolean` in request

### Risk: Schema changes break downstream clients
**Impact:** API contract breakage  
**Mitigation:** Version schema as `v1` in response; commit to 30d deprecation notice before changes

---

## 📝 Codex Usage

### Suggested Workflow
```bash
# Step 1: Run all M3 tests to ensure baseline
npm test

# Step 2: Implement in order
# First, create the schema and types (issues #47-#49)
codex exec "Implement M4 foundation: \
  1. Expand packages/core/src/rag/schema.ts with SearchResponse schema \
  2. Create packages/rag/src/query-rewriting.ts with intent detection \
  3. Create packages/storage/src/search-cache.ts with KV caching \
  
  Reference: /home/dfox/projects-cf/crispy-enigma/docs/M4-CODEX-PLAN.md (issues #47-#49)"

# Step 3: Wire the endpoint
codex exec "Implement M4 endpoint (issue #46): \
  Modify apps/worker-api/src/index.ts to build /search handler that: \
  1. Calls queryRewriting (new intent detection) \
  2. Checks cache \
  3. Runs full RAG pipeline (existing M3) \
  4. Generates follow-ups (LLM call) \
  5. Returns SearchResponse per schema"

# Step 4: Add observability
codex exec "Implement M4 metrics (issues #50-#51): \
  Add SearchMetrics type and emission to /search handler"

# Step 5: Tests
codex exec "Implement M4 tests (issues #52-#53): \
  Create tests/search-schema-validation.test.ts and tests/search-caching.test.ts"

# Validation
npm test
npm run typecheck
```

---

## 📚 Reference Files

**M3 Foundation (Read-only):**
- `packages/rag/src/rag.ts` — RAG assembly, citations, safety filters
- `packages/rag/src/retrieval.ts` — Vectorize retrieval pipeline
- `packages/rag/src/embeddings.ts` — Gateway embedding calls

**M4 Implementation Points:**
- `apps/worker-api/src/index.ts` — Handler entry (line 645-707)
- `packages/core/src/rag/schema.ts` — Request/response schemas
- `packages/core/src/responses.ts` — Response envelope pattern
- `packages/storage/src/do.ts` — Durable Object pattern (reference)

**Testing:**
- `tests/rag-*.test.ts` — Pattern for RAG tests
- `tests/streaming.test.ts` — Vitest setup reference
- `vitest.config.ts` — Test runner config

**Related Docs:**
- `docs/handoff-M3.md` — M3 summary & known limitations
- `docs/M4-PREP.md` — M4 risks & acceptance criteria
- `docs/architecture.md` — Tenant scoping patterns

---

## 🔄 Handoff Checklist

- [ ] All 8 issues implemented and tested
- [ ] `npm test` passes 100%
- [ ] `npm run typecheck` clean
- [ ] Schema responses validated against SearchResponse
- [ ] Cache isolation verified per tenant
- [ ] Metrics emitted with accurate latencies
- [ ] Staging validation complete (if Vectorize available)
- [ ] PR reviewed and merged

---

End of M4 Codex Plan
