# Cloudflare Workers AI Multi-Tenant Monorepo — plan.md
https://github.com/users/rainbowkillah/projects/12

## 0) Executive Summary

We are building a multi-tenant Cloudflare Workers AI platform inside a monorepo. It must support:
- Workers AI (model inference), AI Gateway (policy/routing/observability), Vectorize (embeddings + retrieval), AI Search (RAG UX), KV, Durable Objects (sessions/state), streaming chat, “tool”/function execution, TTS contract (and optional implementation depending on provider constraints), metrics + QA gates, and repeatable deployments per tenant/account.

We also build a developer experience layer: an **Nx plugin** that provides generators/executors comparable to Cloudflare’s `wrangler` + `create-cloudflare` so new apps/services/tenants can be created and deployed consistently.

## 1) Architecture mapped to Cloudflare primitives

### 1.1 Request lifecycle overview
1) **HTTP request enters Worker** (`apps/worker-api`).
2) **Tenant resolution middleware** determines tenant boundary before any storage/AI call.
3) **Policy enforcement** (rate limits, feature flags, quotas, CORS) via DO + KV.
4) **Model/Embedding calls** routed through **AI Gateway** to **Workers AI**.
5) **Stateful/session ops** via **Durable Objects**.
6) **Cache + metadata** via **KV**.
7) **Retrieval** via **Vectorize** (tenant-scoped index).
8) **Response streaming** to client with trace ids.

### 1.2 Primitive mapping (direct)
- **Workers AI**
  - Text generation and embeddings.
  - All calls routed through AI Gateway for policy + observability.
- **AI Gateway**
  - Model routing, budget/limit policy, request logging.
  - Enforces per-tenant model allow-lists and token budgets.
- **Vectorize**
  - Per-tenant index for embeddings and retrieval.
  - Metadata stored with tenantId, docId, chunkId, source.
- **KV**
  - Tenant configuration cache, prompt versions, feature flags, lightweight caches.
- **Durable Objects**
  - Session state for chat.
  - Rate limiter and per-tenant counters.
  - Ingestion job coordination (optional).

### 1.3 Core components
- `apps/worker-api`
  - `/chat` streaming chat
  - `/search` RAG-style search
  - `/tools/execute` tool/agent execution
  - `/ingest` (optional) or split into `apps/ingest-worker`
- `apps/ingest-worker` (optional separation)
  - chunking + embeddings + Vectorize upsert
- `packages/core`
  - tenant resolution, policy checks, schemas, errors
- `packages/storage`
  - KV/DO/Vectorize adapters with tenant enforcement
- `packages/ai`
  - AI Gateway client wrapper, model routing
- `packages/rag`
  - chunking, retrieval assembly, prompt/citations
- `packages/observability`
  - structured logs and metrics helpers

---

## 2) Interfaces and tenancy boundaries

### 2.1 Tenant boundary definition
**Tenant boundary** is the minimal isolation unit. No access across tenants unless explicitly configured as shared. All storage keys, DO IDs, Vectorize indexes, and AI policy are tenant-scoped.

### 2.2 Tenant resolution contract
- **Inputs:** header `x-tenant-id`, host name, or API key mapping.
- **Output:** `TenantContext` attached to request.

```ts
export type TenantContext = {
  tenantId: string;
  accountId?: string;
  aiGatewayRoute: string;
  aiModels: {
    chat: string;
    embeddings: string;
  };
  kvNamespace: string;
  vectorizeIndex: string;
  doSessionName: string;
  rateLimit: {
    perMinute: number;
    burst: number;
  };
  featureFlags: Record<string, boolean>;
};
```

### 2.3 Storage adapters (enforced tenancy)
- **KV adapter**
  - `get(tenantId, key)`, `put(tenantId, key, value)`
  - Internally prefixes key with `tenantId:` if sharing a namespace.
- **Vectorize adapter**
  - `query(tenantId, embedding, options)`
  - `upsert(tenantId, vectors[])`
  - Uses tenant-scoped index or metadata filters.
- **DO session adapter**
  - `getSession(tenantId, sessionId)`
  - `appendMessage(tenantId, sessionId, message)`
  - DO ID must encode `tenantId`.

### 2.4 AI interface
- **Gateway-first**: all Workers AI calls must go through AI Gateway wrapper.
- **Chat inference**
  - `generateChat(tenantId, messages, options)`
- **Embedding generation**
  - `generateEmbedding(tenantId, text[])`

### 2.5 Multi-tenancy enforcement points
- Tenant resolution middleware runs before any handler.
- Shared adapters must require `tenantId` in method signatures.
- All DO IDs must include `tenantId`.
- Vectorize indexes are per-tenant; if shared, enforce metadata filter `tenantId`.
- AI Gateway policy uses tenant-scoped routes.

---

## 3) Milestones with acceptance criteria

### M0 — Foundation ([Issues #3-#14](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM0))
**Deliverables**
- [#3](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/3) Create monorepo skeleton (apps/packages/tenants/docs/scripts/tests)
- [#4](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/4) Set up TypeScript baseline + tsconfig for Workers runtime
- [#5](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/5) Configure ESLint + Prettier
- [#6](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/6) Set up Vitest test runner
- [#7](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/7) Create project.json for each apps/* and packages/* target
- [#8](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/8) Implement tenant resolution middleware (header/hostname priority) **CRITICAL**
- [#9](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/9) Define tenant.config.json schema + Zod validation
- [#10](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/10) Create core error handling + response envelopes
- [#11](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/11) Set up local dev with wrangler dev
- [#12](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/12) Create hello endpoint per tenant + smoke tests
- [#13](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/13) Define Env typings source of truth (packages/core/src/env.ts)
- [#14](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/14) Document wrangler version, ESM format decision

**Acceptance criteria**
- Local dev can resolve tenant and return `/health` response.
- Any request missing tenant is rejected.
- Unit tests cover tenant resolution and adapter key prefixing.

---

### M1 — Chat + Sessions ([Issues #15-#24](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM1))
**Deliverables**
- [#15](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/15) Build /chat endpoint with request schema
- [#16](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/16) Define streaming response contract (SSE vs chunked)
- [#17](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/17) Implement Durable Object session store (tenant-scoped)
- [#18](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/18) Add conversation history with retention policy
- [#19](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/19) Implement KV cache layer (tenant-scoped keys)
- [#20](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/20) Implement DO-based rate limiter (per tenant + per IP/user)
- [#21](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/21) Define rate limit keying strategy (tenant+user+ip)
- [#22](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/22) Create streaming behavior tests
- [#23](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/23) Create session isolation tests
- [#24](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/24) Create rate limit enforcement tests

**Acceptance criteria**
- Session messages persist for same tenant/session.
- Cross-tenant session access is denied.
- Rate limiter rejects over-limit requests with trace id.

---

### M2 — AI Gateway ([Issues #25-#31](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM2))
**Deliverables**
- [#25](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/25) Gateway integration spike - prove connectivity + configuration **CRITICAL SPIKE**
- [#26](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/26) Implement model routing (tenant config chooses models)
- [#27](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/27) Add per-route model override options
- [#28](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/28) Implement budget/limits hooks (token limits)
- [#29](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/29) Add observability hooks (latency, status, tokens in/out)
- [#30](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/30) Document AI Gateway integration in docs/ai-gateway.md
- [#31](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/31) Document fallback behavior for API changes

**Acceptance criteria**
- All model calls pass through AI Gateway (verified by gateway logs).
- Tenant-specific model selection works.
- Usage metrics (latency, tokens if available) are recorded.

---

### M3 — Embeddings + Vectorize + RAG Assembly ([Issues #32-#45](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM3))
**Deliverables**
- [#32](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/32) Implement ingestion pipeline (chunking strategy)
- [#33](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/33) Implement embedding generation
- [#34](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/34) Implement Vectorize upsert with metadata
- [#35](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/35) Implement retrieval pipeline (query embedding)
- [#36](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/36) Implement Vectorize search
- [#37](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/37) Add optional rerank hook interface
- [#38](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/38) Implement RAG response assembly with prompt template
- [#39](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/39) Add citations to RAG responses
- [#40](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/40) Implement basic safety filters
- [#41](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/41) Ensure Vectorize indexes are tenant-scoped **CRITICAL**
- [#42](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/42) Create deterministic fixture retrieval tests
- [#43](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/43) Create tenant isolation tests for Vectorize
- [#44](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/44) Create metadata integrity tests
- [#45](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/45) Document Vectorize local emulation limitations + staging strategy

**Acceptance criteria**
- Ingested docs are retrievable for correct tenant only.
- Retrieval returns deterministic results with fixture docs.
- Vectorize queries fail closed without tenant context.

---

### M4 — AI Search UX Endpoint ([Issues #46-#53](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM4))
**Deliverables**
- [#46](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/46) Build /search endpoint with output schema
- [#47](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/47) Define output schema: answer + sources + confidence + follow-ups
- [#48](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/48) Implement query rewriting / intent detection
- [#49](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/49) Implement caching for common queries (tenant-scoped KV)
- [#50](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/50) Add search latency metrics
- [#51](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/51) Add cache hit rate metrics
- [#52](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/52) Create schema validation tests
- [#53](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/53) Create caching behavior tests

**Acceptance criteria**
- `/search` returns answer + sources + confidence fields.
- Citations trace back to Vectorize metadata.
- Cache hit reduces latency for repeat queries.

---

### M5 — Tool/Function Execution System ([Issues #54-#66](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM5))
**Deliverables**
- [#54](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/54) Define tool schema (JSON schema for name, args, permissions)
- [#55](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/55) Implement tool dispatcher with registry
- [#56](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/56) Implement validation + auth/permission gating
- [#57](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/57) Implement tool: summarize
- [#58](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/58) Implement tool: extract entities
- [#59](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/59) Implement tool: classify intent
- [#60](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/60) Implement tool: tag/chunk docs
- [#61](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/61) Implement tool: ingest docs
- [#62](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/62) Implement audit logging (tool name + args hash + outcome)
- [#63](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/63) Create permission tests
- [#64](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/64) Create injection guard tests
- [#65](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/65) Create tool correctness tests
- [#66](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/66) Document tool contracts

**Acceptance criteria**
- Invalid tool calls rejected with explicit error.
- Each tool execution logged with tenant + request id.
- Tool registry supports enable/disable per tenant.

---

### M6 — TTS Adapter Boundary ([Issues #67-#73](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM6))
**Deliverables**
- [#67](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/67) Define /tts contract (input: text, voice, format, streaming)
- [#68](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/68) Define output contract (audio stream or job id)
- [#69](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/69) Implement adapter interface
- [#70](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/70) Implement stub with 'not enabled' behavior
- [#71](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/71) If feasible: implement provider adapter
- [#72](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/72) Create contract tests
- [#73](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/73) Create stub behavior tests

**Acceptance criteria**
- TTS endpoint exists with clear contract.
- Adapter interface allows future provider integration.
- Stub implementation returns appropriate error when not configured.

---

### M7 — Observability, Metrics, QA Gates ([Issues #74-#85](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM7))
**Deliverables**
- [#74](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/74) Finalize logging schema with required fields
- [#75](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/75) Define correlation IDs and tracing strategy
- [#76](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/76) Implement metrics helpers
- [#77](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/77) Implement required metrics
- [#78](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/78) Add cost monitoring metrics (token usage)
- [#79](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/79) Create dashboards/alerts suggestions document
- [#80](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/80) Create load test scripts
- [#81](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/81) Create retrieval quality 'smoke score' regression suite
- [#82](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/82) Create streaming stability tests
- [#83](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/83) Set up CI gates (lint, typecheck, unit, integration)
- [#84](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/84) Document failure mode template
- [#85](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/85) Document external dependency failure strategies

**Acceptance criteria**
- Logs include tenantId, requestId, latency, route.
- Required metrics are emitted and can be queried.
- Load tests pass with defined thresholds.
- CI gates prevent broken code from merging.

---

### M8 — Deployment Automation ([Issues #86-#93](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3AM8))
**Deliverables**
- [#86](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/86) Create deployment script: deploy one tenant
- [#87](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/87) Create deployment script: deploy all tenants
- [#88](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/88) Add environment selection (dev/stage/prod)
- [#89](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/89) Implement config validation (fail fast)
- [#90](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/90) Implement drift detection (expected vs deployed)
- [#91](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/91) Define multi-account credential strategy **CRITICAL**
- [#92](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/92) Create deploy rollback runbook
- [#93](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/93) Create incident response runbook

**Acceptance criteria**
- `deploy <tenant>` works without manual config edits.
- `deploy-all` fails safely per tenant and reports status.

---

## Nx Plugin Development (Issues #94-#117)

### NX-1 — Plugin Foundation ([Issues #94-#99](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3Anx))
- [#94](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/94) Create Nx plugin package skeleton (packages/nx-cloudflare)
- [#95](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/95) Implement init generator
- [#96](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/96) Add shared utilities: parse tenant config
- [#97](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/97) Add shared utilities: update JSONC (use jsonc-parser)
- [#98](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/98) Add shared utilities: validate config
- [#99](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/99) Set up plugin testing infrastructure

### NX-2 — Worker Generator ([Issues #100-#104](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3Anx))
- [#100](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/100) Scaffold worker-api template with tenant middleware
- [#101](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/101) Add /health endpoint to template
- [#102](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/102) Add project.json targets for dev/test/deploy
- [#103](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/103) Define executor-to-wrangler mapping
- [#104](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/104) Create worker generator tests

### NX-3 — Tenant Generator ([Issues #105-#109](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3Anx))
- [#105](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/105) Scaffold tenant folder structure
- [#106](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/106) Generate tenant.config.json template
- [#107](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/107) Generate wrangler.jsonc template
- [#108](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/108) Add tenant registry file for discoverability
- [#109](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/109) Create tenant generator tests

### NX-4 — Binding & Deploy Generators ([Issues #110-#117](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3Anx))
- [#110](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/110) Implement binding generator (KV/DO/Vectorize/AI)
- [#111](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/111) Update Env typing from single canonical file
- [#112](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/112) Add DO class skeleton generation
- [#113](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/113) Implement deployAll executor
- [#114](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/114) Add concurrency policy to deployAll
- [#115](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/115) Add dry-run mode to deployAll
- [#116](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/116) Add continue-on-error flag to deployAll
- [#117](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/117) Create binding generator/executor tests

---

## Review Items ([Issues #118-#124](https://github.com/rainbowkillah/cloudflare-mono-repo/issues?q=is%3Aissue+label%3Areview))
- [#118](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/118) Add explicit milestone dependency mapping
- [#119](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/119) Quantify exit criteria with specific metrics
- [#120](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/120) Define E2E testing layer
- [#121](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/121) Add security testing activities
- [#122](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/122) Establish performance baselines
- [#123](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/123) Define AuthN/AuthZ strategy
- [#124](https://github.com/rainbowkillah/cloudflare-mono-repo/issues/124) Pick logging/metrics sink

---

## 4) Unknowns and validation experiments

### U1 — AI Gateway routing specifics
**Unknown**
- Exact header/config requirements for routing Workers AI calls via AI Gateway in Workers runtime.

**Experiment**
- Build a minimal Worker calling Workers AI via Gateway.
- Validate that gateway logs show request ids, latency, and usage.

**Success signal**
- Gateway dashboard displays requests matching test tenant.

---

### U2 — Workers AI embeddings + Vectorize latency
**Unknown**
- End-to-end latency for embed → Vectorize upsert and query at scale.

**Experiment**
- Ingest 1k docs and benchmark retrieval latency.
- Capture P50/P95 latency with/without cache.

**Success signal**
- P95 retrieval latency within acceptable target (define once SLOs set).

---

### U3 — Durable Object session throughput
**Unknown**
- DO performance under concurrent streaming chat sessions.

**Experiment**
- Simulate 100 concurrent sessions with streaming writes.
- Measure contention and response stability.

**Success signal**
- No data loss; latency stable under concurrent load.

---

### U4 — Multi-tenant Vectorize index strategy
**Unknown**
- Whether separate indexes per tenant or single index with metadata filter is best.

**Experiment**
- Compare cost/latency between per-tenant indexes vs shared index + filter.

**Success signal**
- Choose approach with best cost/latency and acceptable isolation guarantees.

---

### U5 — KV consistency for feature flags
**Unknown**
- KV propagation delay impact on feature flags and routing decisions.

**Experiment**
- Flip flag and measure propagation time across regions.

**Success signal**
- Documented max delay and mitigation strategy (fallback defaults).

---

## 5) Deliverable checklist
- `apps/worker-api` with tenancy enforcement.
- `packages/core`, `packages/storage`, `packages/ai`, `packages/rag`.
- `docs/architecture.md` and `docs/tenancy.md`.
- `plan.md` kept as source of truth for milestones.