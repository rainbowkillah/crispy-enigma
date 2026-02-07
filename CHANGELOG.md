# Changelog

All notable changes for this project are documented here.

## [1.2.0] - 2026-02-07 (M2: AI Gateway Integration Complete)

### Status
- ✅ All issues complete (#25-#31)
- 40 tests passing (up from 32 at M1 close)
- TypeScript: ✅ No errors
- Lint: ✅ No errors

### Added
- `modelId` request override with precedence (request > env > tenant).
- Optional model allow-list enforcement via `featureFlags.modelAllowList`.
- Token usage tracking, latency metrics, and KV-backed budget checks.
- Usage headers for non-streaming responses and usage payload in SSE `done` events.
- AI Gateway integration documentation (`docs/ai-gateway.md`).
- AI Gateway fallback behavior documentation (`docs/ai-gateway-fallbacks.md`).
- ADR for model selection precedence (`docs/adrs/ADR-004-model-selection-precedence.md`).
- Token budget enforcement tests (`tests/token-budget.test.ts`).
- Model override tests (`tests/ai-gateway.test.ts`).
- Staging AI Gateway spike results + commands in `docs/milestones/M2.md` and `docs/handoff-M2.md`.

### Changed
- AI Gateway wrapper now emits usage metrics and estimates tokens when missing.
- Chat handler records token counts per message.
- Alpha tenant config includes token budget and allowed model list for validation coverage.
- AI Gateway example doc now uses placeholder tokens and .env reference.
- Durable Object migrations use `new_sqlite_classes` for free-plan compatibility.
- Tenant AI Gateway IDs aligned with actual Cloudflare gateway slugs (`ai-gate`, `ai_gateway`) for staging validation.
- Remote bindings configured in `wrangler.jsonc` for `mrrainbowsmoke` and `rainbowsmokeofficial`.

### Dev Smoke Test Results
- `mrrainbowsmoke` (remote bindings): `/health` ✅, `/chat` returns `ai_error` (502) with usage metrics
- `rainbowsmokeofficial` (local dev): `/health` ✅, `/chat` returns `ai_error` (AI binding not supported locally)

---

## [1.3.0] - 2026-02-07 (M3: Ingestion Pipeline Kickoff)

### Added
- Initial chunking utility for ingestion pipeline (`packages/rag/src/chunking.ts`).
- Chunking tests (`tests/rag-chunking.test.ts`).
- Gateway embeddings helper for M3 (`packages/rag/src/embeddings.ts`).
- Embedding tests (`tests/rag-embeddings.test.ts`).
- Vectorize upsert helper with metadata (`packages/rag/src/vectorize.ts`).
- Vectorize upsert test (`tests/rag-vectorize-upsert.test.ts`).
- Retrieval pipeline helper (`packages/rag/src/retrieval.ts`).
- Retrieval tests (`tests/rag-retrieval.test.ts`).
- Vectorize search helper (`packages/rag/src/vectorize.ts`).
- Vectorize search test (`tests/rag-vectorize-upsert.test.ts`).
- Optional rerank hook interface (`packages/rag/src/retrieval.ts`).
- RAG prompt assembly helper (`packages/rag/src/rag.ts`).
- RAG assembly test (`tests/rag-assembly.test.ts`).
- RAG citations output (`packages/rag/src/rag.ts`).
- Basic RAG safety filter (`packages/rag/src/rag.ts`).
- Vectorize tenant scoping tests (`tests/vectorize-tenant-scope.test.ts`).
- Deterministic retrieval fixtures (`tests/rag-fixture-retrieval.test.ts`).
- Metadata integrity tests (`tests/rag-vectorize-upsert.test.ts`).
- Vectorize local emulation doc (`docs/vectorize-dev.md`).
- Wired `/ingest` and `/search` endpoints to RAG ingestion + retrieval pipeline.

---

## [1.1.0] - 2026-02-06 (M1: Chat + Sessions Complete)

### Added
- `/chat` streaming SSE endpoint with non-stream fallback
- `ChatSession` Durable Object with retention enforcement (30 days, 1000 messages)
- `RateLimiter` Durable Object with tenant+user scoping
- Session history and clear endpoints (`GET /chat/:sessionId/history`, `DELETE /chat/:sessionId`)
- Rate limit response headers (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`)
- Chat request schema with Zod validation
- KV cache adapter extensions (cache prefix, TTL support)
- Documentation: `docs/streaming.md`, `docs/sessions.md`, `docs/rate-limiting.md`
- Tests: streaming, session isolation, rate limiting (32 tests total)

### Changed
- Tenant config schema extended with `sessionRetentionDays`, `maxMessagesPerSession`
- All tenant `wrangler.jsonc` files include DO bindings (`CHAT_SESSION`, `RATE_LIMITER_DO`)

---

## [1.0.0] - 2026-02-06 (M0: Foundation Complete)

### Added
- Monorepo structure (`apps/`, `packages/`, `tenants/`, `docs/`, `scripts/`, `tests/`)
- Tenant resolution middleware (header → host → API key)
- Zod-validated tenant configs
- `/health` endpoint with tenant-aware responses
- Tenant-scoped storage adapters (KV prefixing, DO name encoding, Vectorize namespace)
- Response envelopes with trace ID propagation
- ESLint, Prettier, Vitest, Nx configuration
- Wrangler 4.63.0 pinned with ESM module format
- Miniflare for local emulation
- Documentation: `docs/wrangler.md`, `docs/plan.md`, `docs/architecture.md`
- Tests: tenant resolution, health, KV prefixing, DO naming (13 tests)

### Security
- No secrets in repository
- Strict input validation with Zod
- Tenant isolation enforced at all storage boundaries
- Trace IDs for request correlation
