# M4 Staging Deployment & Validation Guide

**Date:** 2026-02-07  
**Status:** 📋 Ready for Staging Deployment  
**Objective:** Validate `/search` endpoint with live Vectorize + AI Gateway before M5  
**Estimated Duration:** 2–4 hours (includes data setup + validation)

---

## Overview

This guide covers deploying the M4 `/search` endpoint to a staging environment where it can be validated with real Cloudflare bindings (Vectorize vector database + AI Gateway for LLM inference).

### Why Staging Validation?

Local tests use mocks; staging validation confirms:
- ✅ Real Vectorize index connectivity
- ✅ Real AI Gateway query rewriting & embeddings
- ✅ Live latency measurements (P50, P95, P99)
- ✅ Cache behavior under realistic load
- ✅ Metrics KV aggregation with production traffic

### What We're Validating

| Component | Test | Success Criteria |
|-----------|------|---|
| Query Rewriting | AI Gateway rewrites query | < 2s latency, fallback if timeout |
| Vectorize Search | Real vector embedding + search | Returns relevant results |
| Caching | KV cache hit/miss tracking | Cache hit rate > 65% after 10 queries |
| Latency Metrics | Operation-level timing | P95 < 2s total, logs to KV |
| Cache Metrics Endpoint | `/metrics/search-cache` response | Correct hit rate, top queries |
| Tenant Isolation | Different tenants don't see each other's data | All queries scoped to tenantId |

---

## Prerequisites

### 1. Staging Environment Setup

Before deployment, ensure you have:

- [ ] **Staging Cloudflare Account** (separate from production)
  - Or: Use same account but different workers domain (e.g., `staging.example.com`)
  
- [ ] **Vectorize Index Created**
  ```bash
  # Option 1: Via Wrangler (if your account has access)
  wrangler vectorize create vectorize-staging --dimension=1024
  
  # Option 2: Via Cloudflare Dashboard
  # Navigate to: Workers → Vectorize → Create Index
  # - Name: vectorize-staging
  # - Dimension: 1024 (matches model output)
  # - Metric: cosine
  ```

- [ ] **AI Gateway Configured**
  ```bash
  # Verify your tenant config has aiGatewayId set:
  cat tenants/staging/tenant.config.json | grep aiGatewayId
  # Expected: "aiGatewayId": "staging-gateway" (or similar)
  ```

- [ ] **Sample Data Ingested**
  - Option A: Use `/ingest` endpoint to upload test documents
  - Option B: Run ingest script: `npm run ingest:staging -- --docs=sample.json`

### 2. Tenant Configuration for Staging

Update the staging tenant config:

```jsonc
// tenants/staging/tenant.config.json
{
  "tenantId": "staging",
  "accountId": "your-cloudflare-account-id",
  "aiGatewayId": "staging-gateway",
  "aiModels": {
    "chat": "@cf/meta/llama-2-7b-chat-int8",
    "embeddings": "@cf/baai/bge-base-en-v1.5",
    "rewrite": "@cf/meta/llama-2-7b-chat-int8"  // Query rewriting
  },
  "vectorizeNamespace": "staging-search",      // KV namespace for staging
  "vectorizeIndex": "vectorize-staging",       // Vectorize index name
  "rateLimit": { "perMinute": 300, "burst": 50 },
  "searchCache": {
    "ttlSeconds": 86400,                        // 24h TTL
    "maxSize": "100MB"                          // KV space limit
  }
}
```

### 3. Sample Test Documents

Create sample documents for testing:

```bash
# File: sample-docs.json
[
  {
    "docId": "doc-001",
    "title": "Rate Limiting Guide",
    "content": "Rate limiting in Cloudflare Workers prevents abuse by restricting request..." 
  },
  {
    "docId": "doc-002",
    "title": "KV Storage Best Practices",
    "content": "KV (Key-Value) storage provides fast, globally distributed..."
  },
  {
    "docId": "doc-003",
    "title": "Vectorize Vector Database",
    "content": "Vectorize is Cloudflare's managed vector database for semantic search..."
  },
  // ... add 5-10 more documents
]
```

Ingest documents:

```bash
# Use the /ingest endpoint
curl -X POST https://staging.example.com/ingest \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: staging" \
  -d @sample-docs.json
```

---

## Deployment Steps

### Step 1: Deploy to Staging Environment

```bash
# From project root
cd /home/dfox/projects-cf/crispy-enigma

# Build & typecheck
npm run typecheck
npm run lint

# Deploy to staging Worker
npm run deploy -- --env=staging --tenant=staging
# Output: https://staging.example.com (or your staging domain)
```

**Expected Output:**
```
Deployments
✓ Uploaded worker
✓ Built successfully
Environment: staging
Worker domain: https://staging-worker.example.workers.dev
```

### Step 2: Verify Deployment

Check that the `/search` endpoint is accessible:

```bash
# Health check
curl https://staging.example.com/health \
  -H "X-Tenant-ID: staging"

# Expected response:
# {"ok": true, "status": "healthy", "tenantId": "staging"}
```

### Step 3: Verify Bindings

Confirm Vectorize + AI Gateway + KV are bound:

```bash
# Check worker metadata
wrangler deployments list --name worker-api

# Verify bindings in wrangler.jsonc
cat wrangler.jsonc | grep -A 10 "vectorize\|kv_namesp"
```

---

## Validation Checklist

### Phase 1: Basic Connectivity (15 min)

- [ ] `/search` endpoint responds with 200
- [ ] Requests without tenant are rejected (400)
- [ ] Response envelope is valid JSON (`{ok, data, error}`)

```bash
# Test basic search
curl -X POST https://staging.example.com/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: staging" \
  -d '{
    "sessionId": "test-session",
    "query": "What is rate limiting?",
    "stream": false
  }'

# Expected response (200 OK):
#{
#  "ok": true,
#  "data": {
#    "answer": "Rate limiting is a technique...",
#    "sources": [...],
#    "confidence": 0.92,
#    "followUps": [...]
#  }
#}
```

### Phase 2: Query Rewriting (20 min)

Test that query rewriting works with real AI Gateway:

```bash
# Query 1: Simple question
curl -X POST https://staging.example.com/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: staging" \
  -d '{
    "sessionId": "test-1",
    "query": "How do I limit requests?"
  }'

# Log rewrite latency (check Worker logs):
# search.rewrite.latency_ms: 450ms (rewritten to structured query)

# Query 2: Complex question (test fallback)
curl -X POST https://staging.example.com/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: staging" \
  -d '{
    "sessionId": "test-2",
    "query": "Compare Cloudflare rate limiting vs AWS WAF"
  }'

# Success criteria:
# - Rewrite completes in < 5s (else fallback to original)
# - Answer is relevant to original query
# - Sources returned with confidence scores
```

**Validation Points:**
- [ ] Rewrite latency metric emitted to KV
- [ ] If rewrite timeout, fallback to original query used
- [ ] Response confidence score reflects rewrite quality

### Phase 3: Caching (20 min)

Test that cache is working correctly:

```bash
# Query 1: Cache miss
START=$(date +%s%N)
curl -X POST https://staging.example.com/search \
  -H "X-Tenant-ID: staging" \
  -d '{"sessionId": "cache-test-1", "query": "What is Vectorize?"}'
END=$(date +%s%N)
echo "First query latency: $((($END - $START) / 1000000))ms"
# Expected: 500–2000ms (cache miss)

# Query 2: Same query, cache hit
START=$(date +%s%N)
curl -X POST https://staging.example.com/search \
  -H "X-Tenant-ID: staging" \
  -d '{"sessionId": "cache-test-2", "query": "What is Vectorize?"}'
END=$(date +%s%N)
echo "Second query latency: $((($END - $START) / 1000000))ms"
# Expected: 50–200ms (cache hit)

# Check cache metrics
curl https://staging.example.com/metrics/search-cache \
  -H "X-Tenant-ID: staging"

# Expected response:
#{
#  "ok": true,
#  "data": {
#    "hits": 1,
#    "misses": 1,
#    "hitRate": 0.50,
#    "topQueries": [
#      {"query": "What is Vectorize?", "hits": 1}
#    ]
#  }
#}
```

**Validation Points:**
- [ ] Second query is 5–10x faster (cache hit)
- [ ] Cache metrics endpoint returns correct hit rate
- [ ] Cache is tenant-scoped (different tenants see different cache)

### Phase 4: Tenant Isolation (15 min)

Verify that different tenants don't see each other's data:

```bash
# Query as tenant "staging"
curl -X POST https://staging.example.com/search \
  -H "X-Tenant-ID: staging" \
  -d '{"sessionId": "isolation-1", "query": "rate limiting"}'
# Response: contains staging document sources

# Query as tenant "prod" (if available)
curl -X POST https://staging.example.com/search \
  -H "X-Tenant-ID: prod" \
  -d '{"sessionId": "isolation-2", "query": "rate limiting"}'
# Response: contains prod document sources (different data)

# Verify cache isolation
curl https://staging.example.com/metrics/search-cache \
  -H "X-Tenant-ID: staging"
# Returns only staging metrics

curl https://staging.example.com/metrics/search-cache \
  -H "X-Tenant-ID: prod"
# Returns only prod metrics (different hit rates expected)
```

**Validation Points:**
- [ ] Each tenant sees only their own documents
- [ ] Cache isolation confirmed (different query results per tenant)
- [ ] Metrics endpoint returns tenant-specific statistics

### Phase 5: Latency Under Load (30 min)

Run a load test to measure real-world latency:

```bash
# Install Apache Bench (or similar)
sudo apt-get install apache2-utils

# Run 100 queries with concurrency=5
ab -n 100 -c 5 -H "X-Tenant-ID: staging" \
  -p search-request.json \
  https://staging.example.com/search

# Expected output:
# Requests per second:        2.50 [#/sec]
# Time per request:           2000.00 [ms]
# Time per request (mean):    400.00 [ms] (across all concurrent requests)
# Transfer rate:              50.00 [Kbytes/sec]

# With cache hits, expected improvement:
# P50: 100–300ms
# P95: 500–1500ms (first 20% cache misses, rest hits)
# P99: 1500–2000ms (worst case)
```

**Validation Points:**
- [ ] P95 latency < 2s
- [ ] P99 latency < 3s
- [ ] No request timeouts (0 failures)
- [ ] Response times improve over time (cache warming)

### Phase 6: Error Handling (15 min)

Test graceful error handling:

```bash
# Test 1: Missing required parameter
curl -X POST https://staging.example.com/search \
  -H "X-Tenant-ID: staging" \
  -d '{"sessionId": "error-1"}'
# Expected: 400 with error message

# Test 2: Invalid JSON
curl -X POST https://staging.example.com/search \
  -H "X-Tenant-ID: staging" \
  -d '{invalid json}'
# Expected: 400 with parse error

# Test 3: Query rewriting timeout (artificial)
# Inject long query that causes timeout:
curl -X POST https://staging.example.com/search \
  -H "X-Tenant-ID: staging" \
  -d '{"sessionId": "error-3", "query": "A VERY LONG QUERY THAT WILL TIMEOUT... (1000 chars)"}'
# Expected: 200 with fallback (original query used)

# Test 4: Vectorize unavailable (if possible to test)
# Expected: 503 with error message or graceful degradation

# Test 5: Rate limiting
for i in {1..350}; do
  curl -X POST https://staging.example.com/search \
    -H "X-Tenant-ID: staging" \
    -d "{\"sessionId\": \"ratelimit-$i\", \"query\": \"test\"}"
done
# Expected: After ~300 requests, get 429 (Too Many Requests)
```

**Validation Points:**
- [ ] All error responses have correct status codes (400, 429, 503)
- [ ] Error messages are descriptive but don't leak sensitive data
- [ ] Rate limiting enforced (300/min per tenant)
- [ ] Timeout fallback works (original query used)

---

## Metrics Collection

### Metrics to Track

| Metric | Source | Expected Value | Critical |
|--------|--------|---|---|
| Search endpoint latency (P95) | CloudFlare Analytics | < 2s | Yes |
| Cache hit rate | `/metrics/search-cache` | > 65% after warmup | Yes |
| Query rewriting latency (P95) | KV metrics | < 1s | No |
| Vectorize search latency (P95) | KV metrics | < 400ms | No |
| Error rate | Worker logs | < 1% | Yes |
| Timeout rate | Worker logs | < 0.5% | Maybe (fallback OK) |

### Viewing Metrics

```bash
# Google Cloud Monitoring (if set up)
# Or: Export from Cloudflare Analytics Engine

# Via KV (manual inspection)
curl https://staging.example.com/metrics/search-cache \
  -H "X-Tenant-ID: staging"

# Via Worker logs
wrangler tail worker-api --env=staging --format pretty
```

---

## Success Criteria

M4 staging validation is **complete** when:

✅ **Connectivity**
- [ ] All endpoints respond with correct HTTP status codes
- [ ] Tenant resolution working (requests without tenant rejected)
- [ ] Response envelopes valid JSON

✅ **Functionality**
- [ ] Query rewriting works (> 90% rewrite success rate)
- [ ] Vectorize search returns relevant results
- [ ] Cache hit rate > 65% after 10 queries
- [ ] Metrics endpoints return correct data
- [ ] Tenant isolation confirmed

✅ **Performance**
- [ ] P95 latency < 2s (including cache misses)
- [ ] P50 latency < 500ms (with cache hits)
- [ ] Zero request timeouts in normal operation
- [ ] Cache provides 5–10x speedup for repeated queries

✅ **Reliability**
- [ ] Error rate < 1% over 1-hour test window
- [ ] No unhandled exceptions in logs
- [ ] Graceful fallback if AI Gateway unavailable
- [ ] Rate limiting working correctly

✅ **Documentation**
- [ ] All validation steps documented
- [ ] Latency baselines recorded
- [ ] Known limitations noted
- [ ] Staging validation summary written

---

## Rollback Plan

If staging validation fails, rollback is simple:

```bash
# Option 1: Revert to previous worker version
wrangler rollback --env=staging

# Option 2: Redeploy last known-good commit
git checkout <last-working-commit>
npm run deploy -- --env=staging --tenant=staging

# Option 3: Disable /search endpoint (keep live, return 501)
# Deploy with feature flag: --disable-search=true
```

---

## Post-Validation Steps

### If Validation Passes ✅

1. **Document Baseline Metrics**
   - Record P50, P95, P99 latencies
   - Record cache hit rate
   - Save metrics snapshot

2. **Promote to Production**
   ```bash
   npm run deploy -- --env=prod --tenant=staging
   ```

3. **Proceed to M5**
   - Start Phase 1 implementation (issue #54–#56)
   - Reference M5-PREP.md for detailed planning

### If Validation Fails ❌

1. **Debug Issues**
   - Review Worker logs for errors
   - Check KV/Vectorize bindings
   - Verify sample data was ingested correctly

2. **Common Issues & Fixes**

   | Issue | Cause | Fix |
   |-------|-------|-----|
   | Vectorize timeout | Index not created | Create index via Dashboard |
   | AI Gateway 401 | Invalid gatewayId | Update tenant config |
   | Cache not working | KV not bound | Check wrangler.jsonc bindings |
   | Low hit rate | TTL too short | Increase cache TTL (M4-PREP.md) |
   | Timeout failures | Query rewriting slow | Lower rewrite timeout threshold |

3. **Report Issues**
   - File GitHub issue with:
     - Error logs (Worker + KV)
     - Sample queries that failed
     - Baseline metrics (if available)
     - Environment details (account, index name)

---

## Timeline Estimate

| Phase | Task | Duration |
|-------|------|----------|
| Setup | Vectorize index + sample data | 30–60 min |
| Deploy | Builder + wrangler deploy | 5–10 min |
| Validation | Run all test suites (Phases 1–6) | 90–120 min |
| Analysis | Review metrics + document results | 20–30 min |
| Total | | **2–4 hours** |

---

## Next Steps

After staging validation succeeds:

1. ✅ **Record Results**
   - Document in [docs/M4-STAGING-VALIDATION.md](M4-STAGING-VALIDATION.md)
   - Include latency baselines + cache hit rates

2. ✅ **Update PROJECT-STATUS.md**
   - Mark M4 as "✅ STAGING VALIDATED"
   - Remove "staging validation pending"

3. ✅ **Move to M5**
   - Begin Phase 1 implementation (tool schema + registry)
   - Reference [docs/M5-PREP.md](M5-PREP.md) for architecture
   - Start with Codex execution for issue #54

---

## Appendix: Config Examples

### wrangler.jsonc (Staging)

```jsonc
{
  "name": "worker-api",
  "env": {
    "staging": {
      "routes": [
        {
          "pattern": "staging.example.com/*",
          "zone_id": "staging-account-zone"
        }
      ],
      "kv_namespaces": [
        {
          "binding": "KV",
          "id": "staging-kv-id",
          "preview_id": "staging-kv-preview"
        }
      ],
      "vectorize": [
        {
          "binding": "VECTORIZE",
          "index_name": "vectorize-staging"
        }
      ],
      "ai": {
        "binding": "AI"
      }
    }
  }
}
```

### tenant.config.json (Staging)

```jsonc
{
  "tenantId": "staging",
  "accountId": "your-cf-account-id",
  "aiGatewayId": "staging-gateway",
  "aiModels": {
    "chat": "@cf/meta/llama-2-7b-chat-int8",
    "embeddings": "@cf/baai/bge-base-en-v1.5",
    "rewrite": "@cf/meta/llama-2-7b-chat-int8"
  },
  "vectorizeIndex": "vectorize-staging",
  "vectorizeNamespace": "staging-search",
  "searchCache": {
    "ttlSeconds": 86400,
    "maxSize": "100MB"
  },
  "rateLimit": {
    "perMinute": 300,
    "burst": 50
  }
}
```

### search-request.json (Load Test)

```json
{
  "sessionId": "test-load",
  "query": "What is rate limiting?",
  "stream": false
}
```

---

## Success: M4 Staging Validation Ready

This guide provides a complete roadmap for validating the M4 `/search` endpoint with real Cloudflare bindings. Once these validation steps pass, you can proceed with confidence to M5 implementation.

**Status:** 📋 Ready for Staging Deployment  
**Estimated Time:** 2–4 hours  
**Next Milestone:** M5 (Tool & Function Execution, Issues #54–#66)

