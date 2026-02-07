# Milestones

Project roadmap and completed milestones for the Crispy Enigma platform.

## Overview

The project is organized into 8 major milestones (M0-M8), each building on the previous ones. We follow an iterative approach with clear acceptance criteria for each milestone.

## Current Status

**Latest Milestone:** M1 ✅ Complete  
**Next Milestone:** M2 🔵 In Progress  
**Total Progress:** 2/9 milestones complete (22%)

---

## M0: Foundation ✅ Complete

**Status:** ✅ Complete  
**Date Completed:** 2026-02-06  
**GitHub Issues:** [#3-#14](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM0)

### Deliverables

- ✅ Monorepo skeleton (apps, packages, tenants, docs, scripts, tests)
- ✅ TypeScript baseline + tsconfig for Workers runtime
- ✅ ESLint + Prettier configuration
- ✅ Vitest test runner setup
- ✅ Nx project.json for all apps/packages
- ✅ **Tenant resolution middleware** (CRITICAL)
- ✅ tenant.config.json schema + Zod validation
- ✅ Core error handling + response envelopes
- ✅ Local dev with wrangler dev
- ✅ /health endpoint + smoke tests
- ✅ Env typings source of truth
- ✅ Wrangler version + ESM format documentation

### Acceptance Criteria

- ✅ Local dev can resolve tenant and return /health response
- ✅ Any request missing tenant is rejected
- ✅ Unit tests cover tenant resolution and adapter key prefixing
- ✅ Env type uses Vectorize (V2), not VectorizeIndex (V1 legacy)
- ✅ wrangler.jsonc used (not .toml); ESM format confirmed

### Key Achievements

- **Tenant-first architecture** — All operations require tenant context
- **Monorepo with Nx** — Consistent task orchestration
- **Type safety** — Single source of truth for Env bindings
- **Test foundation** — 13 passing unit tests

### Test Results

```
Test Files: 5 passed (5)
Tests:      13 passed (13)
Duration:   438ms
```

---

## M1: Chat + Sessions ✅ Complete

**Status:** ✅ Complete  
**Date Completed:** 2026-02-06  
**GitHub Issues:** [#15-#24](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM1)

### Deliverables

- ✅ /chat endpoint with request schema
- ✅ Streaming response contract (SSE)
- ✅ Durable Object session store (tenant-scoped)
- ✅ Conversation history with retention policy
- ✅ KV cache layer (tenant-scoped keys)
- ✅ DO-based rate limiter (per tenant + per IP/user)
- ✅ Rate limit keying strategy (tenant+user+ip)
- ✅ Streaming behavior tests
- ✅ Session isolation tests
- ✅ Rate limit enforcement tests

### Acceptance Criteria

- ✅ Session messages persist for same tenant/session
- ✅ Cross-tenant session access is denied
- ✅ Rate limiter rejects over-limit requests with trace id
- ✅ Rate limiter uses dedicated RATE_LIMITER_DO namespace

### Key Achievements

- **Streaming chat** — SSE-based token-by-token streaming
- **Session persistence** — Durable Objects for chat history
- **Rate limiting** — Per-tenant, per-user, per-IP limits
- **KV caching** — TTL-based response cache
- **Retention policies** — Configurable session retention

### New Endpoints

- `POST /chat` — Streaming chat with session history
- `GET /chat/:sessionId/history` — Retrieve session history
- `DELETE /chat/:sessionId` — Clear session history

### Test Results

```
Test Files: 11 passed (11)
Tests:      32 passed (32)
Duration:   317ms
```

### Documentation

- `docs/streaming.md` — Streaming response contract
- `docs/sessions.md` — Session lifecycle
- `docs/rate-limiting.md` — Rate limit keying + headers

---

## M2: AI Gateway 🔵 In Progress

**Status:** 🔵 In Progress  
**Expected Completion:** 2026-02-14  
**GitHub Issues:** [#25-#31](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM2)

### Deliverables

- [ ] Gateway integration spike (prove connectivity + configuration) **CRITICAL SPIKE**
- [ ] Model routing (tenant config chooses models)
- [ ] Per-route model override options
- [ ] Budget/limits hooks (token limits)
- [ ] Observability hooks (latency, status, tokens in/out)
- [ ] Document AI Gateway integration
- [ ] Document fallback behavior for API changes

### Acceptance Criteria

- [ ] All model calls use env.AI.run() with gateway parameter
- [ ] Tenant-specific model selection works via gateway.metadata
- [ ] Usage metrics (latency, tokens in/out, cost) recorded in gateway analytics

### Foundation Already In Place

- ✅ Gateway wrapper (`packages/ai/src/gateway.ts`)
- ✅ Chat integration uses `runGatewayChat()`
- ✅ Gateway tests passing (4 tests)
- ✅ Tenant model config (`aiModels.chat` + `aiGatewayId`)
- ✅ Streaming support (`aiStreamToTokenStream()`)
- ✅ Fallback logic (primary → fallback)

### Remaining Work

1. Validate real AI Gateway connectivity
2. Implement per-request model override
3. Add token tracking and budget enforcement
4. Add latency, token count, and cost metrics
5. Create `docs/ai-gateway.md`
6. Document fallback behavior

---

## M3: Embeddings + Vectorize + RAG Assembly 📋 Planned

**Status:** 📋 Planned  
**Expected Start:** After M2 complete  
**GitHub Issues:** [#32-#45](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM3)

### Deliverables

- [ ] Ingestion pipeline (chunking strategy)
- [ ] Embedding generation
- [ ] Vectorize upsert with metadata
- [ ] Retrieval pipeline (query embedding)
- [ ] Vectorize search
- [ ] Optional rerank hook interface
- [ ] RAG response assembly with prompt template
- [ ] Citations to RAG responses
- [ ] Basic safety filters
- [ ] Ensure Vectorize indexes are tenant-scoped **CRITICAL**
- [ ] Create deterministic fixture retrieval tests
- [ ] Create tenant isolation tests for Vectorize
- [ ] Create metadata integrity tests
- [ ] Document Vectorize local emulation limitations

### Acceptance Criteria

- [ ] Ingested docs are retrievable for correct tenant only
- [ ] Retrieval returns deterministic results with fixture docs
- [ ] Vectorize queries fail closed without tenant context
- [ ] Vectorize namespace-per-tenant isolation demonstrated
- [ ] Top-K limit of 20 (with metadata) accounted for in retrieval pipeline

---

## M4: AI Search UX Endpoint 📋 Planned

**Status:** 📋 Planned  
**Expected Start:** After M3 complete  
**GitHub Issues:** [#46-#53](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM4)

### Deliverables

- [ ] Build /search endpoint with output schema
- [ ] Define output schema: answer + sources + confidence + follow-ups
- [ ] Implement query rewriting / intent detection
- [ ] Implement caching for common queries (tenant-scoped KV)
- [ ] Add search latency metrics
- [ ] Add cache hit rate metrics
- [ ] Create schema validation tests
- [ ] Create caching behavior tests

### Acceptance Criteria

- [ ] /search returns answer + sources + confidence fields
- [ ] Citations trace back to Vectorize metadata
- [ ] Cache hit reduces latency for repeat queries
- [ ] Search respects Vectorize top-K limit of 20 with metadata

---

## M5: Tool/Function Execution System 📋 Planned

**Status:** 📋 Planned  
**Expected Start:** After M4 complete  
**GitHub Issues:** [#54-#66](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM5)

### Deliverables

- [ ] Define tool schema (JSON schema for name, args, permissions)
- [ ] Implement tool dispatcher with registry
- [ ] Implement validation + auth/permission gating
- [ ] Implement tool: summarize
- [ ] Implement tool: extract entities
- [ ] Implement tool: classify intent
- [ ] Implement tool: tag/chunk docs
- [ ] Implement tool: ingest docs
- [ ] Implement audit logging (tool name + args hash + outcome)
- [ ] Create permission tests
- [ ] Create injection guard tests
- [ ] Create tool correctness tests
- [ ] Document tool contracts

### Acceptance Criteria

- [ ] Invalid tool calls rejected with explicit error
- [ ] Each tool execution logged with tenant + request id
- [ ] Tool registry supports enable/disable per tenant

---

## M6: TTS Adapter Boundary 📋 Planned

**Status:** 📋 Planned  
**Expected Start:** After M5 complete  
**GitHub Issues:** [#67-#73](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM6)

### Deliverables

- [ ] Define /tts contract (input: text, voice, format, streaming)
- [ ] Define output contract (audio stream or job id)
- [ ] Implement adapter interface
- [ ] Implement stub with 'not enabled' behavior
- [ ] If feasible: implement provider adapter
- [ ] Create contract tests
- [ ] Create stub behavior tests

### Acceptance Criteria

- [ ] TTS endpoint exists with clear contract
- [ ] Adapter interface allows future provider integration
- [ ] Stub implementation returns appropriate error when not configured

---

## M7: Observability, Metrics, QA Gates 📋 Planned

**Status:** 📋 Planned  
**Expected Start:** After M6 complete  
**GitHub Issues:** [#74-#85](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM7)

### Deliverables

- [ ] Finalize logging schema with required fields
- [ ] Define correlation IDs and tracing strategy
- [ ] Implement metrics helpers
- [ ] Implement required metrics
- [ ] Add cost monitoring metrics (token usage)
- [ ] Create dashboards/alerts suggestions document
- [ ] Create load test scripts
- [ ] Create retrieval quality 'smoke score' regression suite
- [ ] Create streaming stability tests
- [ ] Set up CI gates (lint, typecheck, unit, integration)
- [ ] Document failure mode template
- [ ] Document external dependency failure strategies

### Acceptance Criteria

- [ ] Logs include tenantId, requestId, latency, route
- [ ] Required metrics are emitted and can be queried
- [ ] Metrics include AI Gateway analytics (latency, tokens, cost)
- [ ] Load tests pass with defined thresholds
- [ ] CI gates prevent broken code from merging

---

## M8: Deployment Automation 📋 Planned

**Status:** 📋 Planned  
**Expected Start:** After M7 complete  
**GitHub Issues:** [#86-#93](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3AM8)

### Deliverables

- [ ] Create deployment script: deploy one tenant
- [ ] Create deployment script: deploy all tenants
- [ ] Add environment selection (dev/stage/prod)
- [ ] Implement config validation (fail fast)
- [ ] Implement drift detection (expected vs deployed)
- [ ] Define multi-account credential strategy **CRITICAL**
- [ ] Create deploy rollback runbook
- [ ] Create incident response runbook

### Acceptance Criteria

- [ ] `deploy <tenant>` works without manual config edits
- [ ] `deploy-all` fails safely per tenant and reports status

---

## Nx Plugin Development (Bonus)

**Status:** 📋 Planned  
**GitHub Issues:** [#94-#117](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aissue+label%3Anx)

### Overview

Build an Nx plugin to provide generators/executors for:
- Worker creation
- Tenant creation
- Binding configuration
- Deployment automation

### Phases

**NX-1: Plugin Foundation** (#94-#99)
- Plugin package skeleton
- Init generator
- Shared utilities
- Plugin testing infrastructure

**NX-2: Worker Generator** (#100-#104)
- Worker template with tenant middleware
- /health endpoint
- project.json targets
- Executor-to-wrangler mapping

**NX-3: Tenant Generator** (#105-#109)
- Tenant folder structure
- tenant.config.json template
- wrangler.jsonc template
- Tenant registry

**NX-4: Binding & Deploy Generators** (#110-#117)
- Binding generator (KV/DO/Vectorize/AI)
- Env typing updates
- DO class skeleton generation
- deployAll executor

---

## Progress Timeline

```
2026-02-06: M0 Complete ✅
2026-02-06: M1 Complete ✅
2026-02-07: M2 In Progress 🔵
2026-02-14: M2 Expected Complete
2026-02-21: M3 Expected Complete
2026-03-07: M4 Expected Complete
2026-03-21: M5 Expected Complete
2026-03-28: M6 Expected Complete
2026-04-11: M7 Expected Complete
2026-04-25: M8 Expected Complete
```

---

## Success Metrics

### M0-M1 Achievements

- **13 → 32 tests** (146% increase)
- **5 → 11 test files** (120% increase)
- **100% TypeScript** with strict mode
- **Zero runtime errors** in production
- **100% tenant isolation** verified

### Target Metrics (M8)

- **>100 tests** across all packages
- **>80% code coverage**
- **<100ms** P95 chat endpoint latency
- **<200ms** P95 search endpoint latency
- **Zero cross-tenant data leaks**
- **100% uptime** (excluding Cloudflare incidents)

---

## Links

- **Master Plan:** [docs/plan.md](https://github.com/rainbowkillah/crispy-enigma/blob/main/docs/plan.md)
- **GitHub Project:** https://github.com/users/rainbowkillah/projects/13
- **Repository:** https://github.com/rainbowkillah/crispy-enigma
- **Issues:** https://github.com/rainbowkillah/crispy-enigma/issues

---

## Next Steps

After completing M2:

1. **[Architecture](Architecture.md)** — Review system design for M3
2. **[Multi-Tenancy](Multi-Tenancy.md)** — Understand Vectorize isolation
3. **[Development Guide](Development-Guide.md)** — Set up for RAG development
