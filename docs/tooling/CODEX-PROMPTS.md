# M4 Codex Execution Scripts

**Ready-to-use prompts for codex implementation of M4 issues #46-#53**

> Copy-paste these into your terminal with `codex exec "..."` or save as a script file.

---

## Phase 1: Foundation (Issues #47-#49)

### Step 1A: Issue #47 - Define output schema
```bash
codex exec "
TASK: Implement M4 Issue #47 — Define output schema: answer + sources + confidence + follow-ups

CONTEXT:
- Current /search endpoint (apps/worker-api/src/index.ts L645-707) returns RAG prompt + citations array
- Need to convert to structured SearchResponse with answer, sources, confidence, followUps
- Pattern reference: searchRequestSchema in packages/core/src/rag/schema.ts

ACTION:
In packages/core/src/rag/schema.ts, append these exports after searchRequestSchema:

export const searchResponseSchema = z.object({
  status: z.literal('ok'),
  traceId: z.string().optional(),
  answer: z.string().min(1).describe('Generated answer from RAG LLM'),
  sources: z.array(z.object({
    id: z.string(),
    docId: z.string(),
    chunkId: z.string(),
    title: z.string().optional(),
    url: z.string().optional(),
    source: z.string().optional(),
    text: z.string().describe('Direct quote from source'),
    score: z.number().min(0).max(1).optional()
  })).min(0).describe('Cited sources with confidence scoring'),
  confidence: z.number().min(0).max(1).describe('Overall answer confidence (0-1)'),
  followUps: z.array(z.string()).min(0).max(5).describe('Suggested follow-up questions')
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

REQUIREMENTS:
- Use zod for all fields
- confidence must be 0-1 range
- followUps max 5 items
- All optional fields marked as .optional()
- Include JSDoc descriptions
- Export both schema and type

VALIDATION:
- Run: npm run typecheck
- No errors should occur
- Type should be exportable from packages/core/src/rag/schema.ts
"
```

### Step 1B: Issue #48 - Implement query rewriting / intent detection
```bash
codex exec "
TASK: Implement M4 Issue #48 — Implement query rewriting / intent detection

CONTEXT:
- Search pipeline currently uses raw user query directly
- Need to pre-process query to improve retrieval accuracy
- Will be called in M4 #46 handler before embedding
- Results cached in M4 #49

ACTION:
Create packages/rag/src/query-rewriting.ts with these functions:

export async function detectQueryIntent(
  tenantId: string,
  gatewayId: string,
  query: string,
  env: Env
): Promise<{ intent: 'question' | 'statement' | 'command' | 'clarification'; rewritten: string }>

export async function rewriteQuery(
  tenantId: string,
  gatewayId: string,
  originalQuery: string,
  env: Env
): Promise<string>

IMPLEMENTATION DETAILS:
1. Use runGatewayChat from packages/ai/src/gateway (existing function)
2. For intent detection: prompt LLM with 'Classify query intent: [query]. Return only: question|statement|command|clarification'
3. For rewrite: prompt with 'Rewrite for clarity and expand with context: [query]. Return only rewritten query.'
4. Use model: env.MODEL_ID ?? config.aiModels.chat
5. Handle timeout/errors gracefully - return original query as fallback
6. Both functions should be wrapped with retry logic (max 1 retry)

REQUIREMENTS:
- Functions export from packages/rag/src/index.ts
- Matches signature: (tenantId, gatewayId, query, env) => Promise<Result>
- No side-effects (pure functions)
- Handle errors without throwing
- Log failures for debugging

VALIDATION:
- npm run typecheck passes
- npm test passes (no new tests required for foundation phase)
"
```

### Step 1C: Issue #49 - Implement caching (tenant-scoped KV)
```bash
codex exec "
TASK: Implement M4 Issue #49 — Implement caching for common queries (tenant-scoped KV)

CONTEXT:
- M4 #46 handler will call these methods to check/set cache
- M4 #50-51 will track cache hits/misses
- Cache key: \${tenantId}:search:\${hash(rewrittenQuery)}
- TTL: 24 hours (86400 seconds)

ACTION:
Create packages/storage/src/search-cache.ts with:

import type { Env } from '../../../packages/core/src';
import type { SearchResponse } from '../../../packages/core/src/rag/schema';

export async function getCachedSearch(
  tenantId: string,
  rewrittenQuery: string,
  env: Env
): Promise<SearchResponse | null>

export async function setCachedSearch(
  tenantId: string,
  rewrittenQuery: string,
  response: SearchResponse,
  ttlSeconds: number = 86400,  // 24h
  env: Env
): Promise<void>

IMPLEMENTATION:
1. Use crypto.subtle.digest('SHA-256', ...) to hash rewritten query (from Web Crypto API)
2. Key format: \`\${tenantId}:search:\${hashHex}\`
3. Store response JSON + metadata { timestamp, docCount }
4. getCachedSearch returns null on cache miss or expired
5. setCachedSearch stores with expirationTtl in KV
6. Handle KV errors gracefully (log, don't throw)

REQUIREMENTS:
- Use env.CACHE or env.KV namespaces (check packages/core/src/env.ts for binding name)
- All keys prefixed with tenantId (tenant isolation)
- No cross-tenant cache contamination
- Type-safe with SearchResponse
- Export both functions from index.ts

VALIDATION:
- npm run typecheck passes
- No KV-specific imports beyond Cloudflare bindings
- Functions are pure async (no side-effects on env)
"
```

---

## Phase 2: Integration (Issues #46, #50-#51)

### Step 2A: Issue #46 - Build /search endpoint with full pipeline
```bash
codex exec "
TASK: Implement M4 Issue #46 — Build /search endpoint with output schema & full pipeline

CONTEXT:
- Current /search stub at apps/worker-api/src/index.ts L645-707
- Needs to orchestrate: query rewrite → cache check → embed → retrieve → rag assembly → follow-up generation
- Must return structured SearchResponse (from M4 #47)
- Must emit latency metrics (for M4 #50-51)

DEPENDENCIES READY:
- M3: RAG assembly, embedding, retrieval ✅
- M4 #47: SearchResponse schema ✅
- M4 #48: Query rewriting ✅
- M4 #49: Search cache ✅

ACTION:
Modify apps/worker-api/src/index.ts /search handler (L645-707):

Replace the existing 'if (ragRoute === \"search\")' block with:

1. Parse SearchRequest (already done on L657)
2. Call rewriteQuery from packages/rag/src (M4 #48)
3. Call getCachedSearch from packages/storage/src (M4 #49)
4. If cache HIT: emit cache_hit metric, return cached response
5. If cache MISS:
   - Timestamp start = performance.now()
   - Embed query using runGatewayEmbeddings
   - Retrieve chunks using runVectorizeRetrieval
   - Assemble prompt using assembleRagPrompt (M3)
   - Call LLM to generate follow-up questions (5 max)
   - Compute confidence from match scores (average of top 3 matches)
   - Build SearchResponse object
   - Call setCachedSearch to populate cache
   - Emit latency metrics (issue #50)
   - Emit cache miss metric (issue #51)
   - Return response

FOLLOW-UPS GENERATION:
Use runGatewayChat with prompt:
'Given this Q&A pair, suggest 3-5 follow-up questions in JSON array format:
Q: [original query]
A: [assembled RAG answer]
Return only: [\"question1\", \"question2\", ...]'

REQUIREMENT:
- Maintain same response envelope pattern (ok/fail functions)
- Include traceId in response
- All operations use explicit tenantId
- Metrics include cacheHit: boolean, latencies object
- Handle errors gracefully (400 invalid, 502 provider errors)
- No changes to other handlers

VALIDATION:
- npm run typecheck passes
- Handler returns SearchResponse matching schema from #47
- Can test with: curl -X POST http://localhost:8787/search -H 'Content-Type: application/json' -H 'X-Tenant-ID: example' -d '{\"query\": \"test\"}'
"
```

### Step 2B: Issue #50 - Add search latency metrics
```bash
codex exec "
TASK: Implement M4 Issue #50 — Add search latency metrics

CONTEXT:
- M4 #46 handler will track per-phase timing
- Need to emit structured SearchMetrics
- Store in KV with tenant scoping
- Key format: \${tenantId}:search:metrics:\${timestamp}

ACTION:
In apps/worker-api/src/index.ts, add SearchMetrics type:

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
    followUpGenerationMs?: number;
  };
  tokensUsed?: {
    rewrite?: { in: number; out: number };
    followUpGeneration?: { in: number; out: number };
  };
  topK: number;
  matchesReturned: number;
};

EMISSION:
In #46 /search handler:
- Wrap each phase in: const phaseStart = performance.now(), then phaseMs = performance.now() - phaseStart
- On success: create SearchMetrics object, store in KV
- KV key: \`\${tenantId}:search:metrics:\${Date.now()}\`
- KV expirationTtl: 604800 (7 days)
- Alternatively: log JSON to stdout with console.log (TBD based on env.ENVIRONMENT)

REQUIREMENTS:
- All timing in milliseconds
- cacheHit: true if response from #49 cache
- topK from request, matchesReturned from actual Vectorize results
- No per-query PII in metrics
- Export SearchMetrics type from index.ts

VALIDATION:
- npm run typecheck passes
- Metrics emitted to KV with correct key format
- All phases tracked with >0ms timing
"
```

### Step 2C: Issue #51 - Add cache hit rate metrics
```bash
codex exec "
TASK: Implement M4 Issue #51 — Add cache hit rate metrics

CONTEXT:
- M4 #46 handler emits individual search_metrics events
- M4 #51 aggregates these into cache effectiveness stats
- Rolling 24-hour window
- Track hitRate, P95 latency comparison

ACTION:
In packages/observability/src/metrics.ts (or create if missing), add:

export type SearchCacheMetrics = {
  tenantId: string;
  period: '1h' | '24h';
  startTime: number;
  endTime: number;
  totalSearches: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;  // 0-1
  avgLatencyMs: { cached: number; uncached: number };
  topCachedQueries: Array<{ queryHash: string; hits: number }>;
};

IMPLEMENTATION:
1. On each /search request (M4 #46): emit atomic event to KV under \`\${tenantId}:search:cache-check:\${date}\`
2. Periodically (hourly): aggregate last 24h of cache-checks → compute hitRate, latency diffs
3. Store aggregated stats in KV: \`\${tenantId}:search:cache-stats:\${period}\`
4. Expose function: getSearchCacheMetrics(tenantId, period, env) => Promise<SearchCacheMetrics>

REQUIREMENTS:
- hitRate = cacheHits / totalSearches (0-1 scale)
- P95 latency: collect all requests, compute 95th percentile for cached vs uncached
- Query hash (not plain text) to avoid storing full queries
- Aggregation happens on-read from KV (lazy eval, no background jobs)
- No real-time dashboards (KV is eventual consistency)

VALIDATION:
- npm run typecheck passes
- Metrics aggregation produces hitRate 0.0-1.0
- P95 calculation handles small datasets (<10 requests) gracefully
"
```

---

## Phase 3: Testing (Issues #52-#53)

### Step 3A: Issue #52 - Schema validation tests
```bash
codex exec "
TASK: Implement M4 Issue #52 — Create schema validation tests

CONTEXT:
- SearchRequest already tested (M1)
- SearchResponse (M4 #47) untested
- Citation format must match Vectorize metadata structure

ACTION:
Create tests/search-schema-validation.test.ts:

describe('Search Request/Response Schema', () => {
  describe('SearchRequest validation', () => {
    it('accepts valid query string', () => {
      const req = { query: 'what is workers' };
      expect(searchRequestSchema.parse(req)).toBeDefined();
    });

    it('rejects empty query', () => {
      expect(() => searchRequestSchema.parse({ query: '' })).toThrow();
    });

    it('accepts optional topK', () => {
      const req = { query: 'test', topK: 10 };
      expect(searchRequestSchema.parse(req).topK).toBe(10);
    });

    it('accepts optional filter metadata', () => {
      const req = { query: 'test', filter: { source: 'docs', year: 2024 } };
      expect(searchRequestSchema.parse(req).filter).toBeDefined();
    });
  });

  describe('SearchResponse validation', () => {
    it('enforces answer as non-empty string', () => {
      const invalid = { answer: '', sources: [], confidence: 0.5, followUps: [] };
      expect(() => searchResponseSchema.parse(invalid)).toThrow();
    });

    it('enforces sources array with required fields', () => {
      const invalid = { 
        answer: 'test', 
        sources: [{ id: 'id1' }],  // missing docId, chunkId
        confidence: 0.5, 
        followUps: [] 
      };
      expect(() => searchResponseSchema.parse(invalid)).toThrow();
    });

    it('enforces confidence 0-1 range', () => {
      const invalid = { answer: 'test', sources: [], confidence: 1.5, followUps: [] };
      expect(() => searchResponseSchema.parse(invalid)).toThrow();
    });

    it('enforces followUps max 5 items', () => {
      const invalid = { 
        answer: 'test', 
        sources: [], 
        confidence: 0.5, 
        followUps: ['q1','q2','q3','q4','q5','q6'] 
      };
      expect(() => searchResponseSchema.parse(invalid)).toThrow();
    });

    it('parses valid SearchResponse', () => {
      const valid = {
        answer: 'Workers is...',
        sources: [
          { id: 'match1', docId: 'doc1', chunkId: 'chunk1', text: 'quote', score: 0.95 }
        ],
        confidence: 0.88,
        followUps: ['How does scaling work?']
      };
      expect(searchResponseSchema.parse(valid)).toBeDefined();
    });

    it('citations trace back to Vectorize metadata format', () => {
      // Verify sources match RagCitation structure from M3
      const response = {
        answer: 'test',
        sources: [{
          id: 'vec-id',
          docId: 'doc-id',
          chunkId: 'chunk-id',
          title: 'Doc Title',
          url: 'https://...',
          source: 'docs',
          text: 'excerpt',
          score: 0.92
        }],
        confidence: 0.9,
        followUps: []
      };
      const parsed = searchResponseSchema.parse(response);
      expect(parsed.sources[0].docId).toBe('doc-id');
      expect(parsed.sources[0].text).toBeDefined();
    });
  });
});

REQUIREMENTS:
- Min 10 test cases
- Cover both input validation (query) and output validation (response)
- Test boundary values: empty strings, confidence 0/1, 5 follow-ups
- Verify citation structure matches Vectorize metadata
- Use vitest syntax consistent with existing tests

VALIDATION:
- npm test tests/search-schema-validation.test.ts passes
- All test cases pass
"
```

### Step 3B: Issue #53 - Cache behavior tests
```bash
codex exec "
TASK: Implement M4 Issue #53 — Create caching behavior tests

CONTEXT:
- M4 #49 provides getCachedSearch / setCachedSearch functions
- M4 #46 calls these in the /search handler
- Need to verify hit/miss detection, TTL expiry, tenant isolation

ACTION:
Create tests/search-caching.test.ts:

import { getCachedSearch, setCachedSearch } from '../packages/storage/src/search-cache';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Search Caching', () => {
  let mockEnv: Env;

  beforeEach(() => {
    // Mock KV namespace
    mockEnv = {
      CACHE: new Map(),  // simple in-memory mock
      // ... other Env bindings
    };
  });

  describe('Cache hit/miss', () => {
    it('returns null on first cache miss', async () => {
      const result = await getCachedSearch('tenant1', 'query1', mockEnv);
      expect(result).toBeNull();
    });

    it('populates cache on setCachedSearch', async () => {
      const response = { answer: 'test', sources: [], confidence: 0.5, followUps: [] };
      await setCachedSearch('tenant1', 'query1', response, 86400, mockEnv);
      const cached = await getCachedSearch('tenant1', 'query1', mockEnv);
      expect(cached).toEqual(response);
    });

    it('returns cached response with <50ms latency', async () => {
      const response = { answer: 'test', sources: [], confidence: 0.5, followUps: [] };
      await setCachedSearch('tenant1', 'query2', response, 86400, mockEnv);
      const t0 = performance.now();
      const cached = await getCachedSearch('tenant1', 'query2', mockEnv);
      const elapsed = performance.now() - t0;
      expect(cached).toBeDefined();
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Tenant isolation', () => {
    it('separates cache per tenant', async () => {
      const response1 = { answer: 'tenant1 answer', sources: [], confidence: 0.5, followUps: [] };
      const response2 = { answer: 'tenant2 answer', sources: [], confidence: 0.3, followUps: [] };
      
      await setCachedSearch('tenant1', 'same-query', response1, 86400, mockEnv);
      await setCachedSearch('tenant2', 'same-query', response2, 86400, mockEnv);
      
      const cache1 = await getCachedSearch('tenant1', 'same-query', mockEnv);
      const cache2 = await getCachedSearch('tenant2', 'same-query', mockEnv);
      
      expect(cache1?.answer).toBe('tenant1 answer');
      expect(cache2?.answer).toBe('tenant2 answer');
    });

    it('no cross-tenant cache bleed', async () => {
      const response = { answer: 'secret', sources: [], confidence: 0.5, followUps: [] };
      await setCachedSearch('tenant-a', 'query', response, 86400, mockEnv);
      const result = await getCachedSearch('tenant-b', 'query', mockEnv);
      expect(result).toBeNull();
    });
  });

  describe('TTL expiry', () => {
    it('removes cache entry after TTL', async () => {
      const response = { answer: 'test', sources: [], confidence: 0.5, followUps: [] };
      await setCachedSearch('tenant1', 'ttl-query', response, 1, mockEnv);  // 1 second TTL
      
      // Check immediately
      let cached = await getCachedSearch('tenant1', 'ttl-query', mockEnv);
      expect(cached).toBeDefined();
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));
      cached = await getCachedSearch('tenant1', 'ttl-query', mockEnv);
      expect(cached).toBeNull();
    });
  });

  describe('Query key generation', () => {
    it('uses rewritten query for cache key (not original)', async () => {
      const original = 'how do workers work';
      const rewritten = 'Explain Cloudflare Workers architecture';
      
      const response = { answer: 'Workers is a...', sources: [], confidence: 0.7, followUps: [] };
      
      // Set cache with rewritten query
      await setCachedSearch('tenant1', rewritten, response, 86400, mockEnv);
      
      // Should NOT find with original query
      expect(await getCachedSearch('tenant1', original, mockEnv)).toBeNull();
      
      // Should find with rewritten query
      expect(await getCachedSearch('tenant1', rewritten, mockEnv)).toBeDefined();
    });
  });
});

REQUIREMENTS:
- Min 10 test cases covering hit/miss, TTL, tenant isolation
- Use vitest mocking for Env bindings
- Verify cache key format includes tenantId
- Test both sync miss and TTL-based miss
- Small latency check (<50ms for hits)
- Test with 24-hour TTL as default

VALIDATION:
- npm test tests/search-caching.test.ts passes
- All assertions pass
- Mock KV setup doesn't interfere with real KV tests elsewhere
"
```

---

## Final Validation

### Run All M4 Tests
```bash
npm test tests/search-*.test.ts
```

### Typecheck
```bash
npm run typecheck
```

### Integration Check
```bash
npm test  # Full suite
npm run lint  # ESLint
```

---

## Execution Checklist

- [ ] Phase 1A: Issue #47 (output schema) — `npm run typecheck` passes
- [ ] Phase 1B: Issue #48 (query rewriting) — functions exportable
- [ ] Phase 1C: Issue #49 (cache) — KV integration correct
- [ ] Phase 2A: Issue #46 (endpoint) — handler wired correctly
- [ ] Phase 2B: Issue #50 (latency metrics) — metrics emitted
- [ ] Phase 2C: Issue #51 (cache metrics) — aggregation works
- [ ] Phase 3A: Issue #52 (schema tests) — 100% pass rate
- [ ] Phase 3B: Issue #53 (cache tests) — 100% pass rate
- [ ] Final: `npm test` — all 80+ tests pass
- [ ] Final: `npm run typecheck` — no errors

---

**Ready to start? Pick a phase and copy-paste the codex command above!**
