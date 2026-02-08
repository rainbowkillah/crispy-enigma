# M5 Handoff: Tool/Function Execution System

**Status:** Complete
**Tests:** 165 passing (59 new M5 tests + 106 existing, 0 regressions)
**Issues covered:** #11, #69-#80

---

## What Was Built

M5 adds a tool/function execution system that lets the AI invoke predefined tools. The system supports two invocation modes:

1. **Standalone** — `POST /tools/execute` for direct tool execution
2. **Chat-integrated** — `tool_name` + `tool_params` in `POST /chat` injects tool results as context before LLM response

### 5 Built-in Tools

| Tool | Purpose | Timeout |
|------|---------|---------|
| `summarize` | Text summarization (paragraph/bullet_points) | 30s |
| `extract_entities` | Named entity extraction (people, places, orgs) | 30s |
| `classify_intent` | Intent classification with confidence scoring | 30s |
| `tag_chunk_docs` | Chunk document + LLM-tag each chunk (parallel, 5 concurrent) | 30s |
| `ingest_docs` | Full RAG pipeline: chunk → embed → upsert to Vectorize | 60s |

### 3 New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tools/execute` | POST | Execute a tool directly |
| `/schema/tools` | GET | List all tool definitions (no handler functions exposed) |
| `/metrics/tools/execution` | GET | Aggregated tool execution metrics (1h/24h/7d) |

### Infrastructure

| Component | File | Purpose |
|-----------|------|---------|
| Dispatcher | `packages/tools/src/dispatcher.ts` | Registry lookup → validate → permission check → execute with timeout |
| Permissions | `packages/tools/src/permissions.ts` | Feature flag-based, **default-deny** for required permissions |
| Errors | `packages/tools/src/errors.ts` | `ToolErrorCode` enum + `ToolExecutionError` class |
| Audit | `packages/tools/src/audit.ts` | KV-backed audit log, SHA-256 param hashing, 7-day TTL |
| Metrics | `packages/tools/src/metrics.ts` | KV-backed metrics, parallel batch reads (50 concurrent) |
| Bootstrap | `packages/tools/src/bootstrap.ts` | Idempotent registration of all 5 tools at module load |

---

## Files Changed

### New Files (22)
```
packages/tools/src/errors.ts
packages/tools/src/permissions.ts
packages/tools/src/dispatcher.ts
packages/tools/src/audit.ts
packages/tools/src/metrics.ts
packages/tools/src/bootstrap.ts
packages/tools/src/builtin/summarize.ts
packages/tools/src/builtin/extract_entities.ts
packages/tools/src/builtin/classify_intent.ts
packages/tools/src/builtin/tag_chunk_docs.ts
packages/tools/src/builtin/ingest_docs.ts
docs/tool-contracts.md
tests/tool-dispatcher.test.ts
tests/tool-permissions.test.ts
tests/tool-injection-guard.test.ts
tests/tool-summarize.test.ts
tests/tool-extract-entities.test.ts
tests/tool-classify-intent.test.ts
tests/tool-tag-chunk-docs.test.ts
tests/tool-ingest-docs.test.ts
tests/tool-audit.test.ts
tests/tool-execute-endpoint.test.ts
```

### Modified Files (4)
```
packages/tools/src/schema.ts        — Extended ToolContext with featureFlags, AI config
packages/tools/package.json         — Added exports + devDependencies (@repo/ai, @repo/rag)
packages/core/src/chat/schema.ts    — Added tool_name, tool_params to chatRequestSchema
apps/worker-api/src/index.ts        — Bootstrap, buildToolContext(), 3 endpoints, /chat tool dispatch
```

---

## Architecture Decisions

1. **Flat tool names** — No namespacing (e.g., `summarize` not `text.summarize`)
2. **In-memory registry** — Tools registered at module load via `bootstrapTools()`, no persistence needed
3. **Permission model** — Default-deny for required permissions (must be explicitly `true` in tenant flags), default-allow for tools without required permissions
4. **Timeout** — `Promise.race` with configurable per-tool and per-call timeouts (1s–60s range)
5. **Audit** — SHA-256 hash of params (no PII in logs), 7-day KV TTL
6. **Parallel processing** — `tag_chunk_docs` uses bounded concurrency (5 concurrent AI calls), metrics reads use batched `Promise.all` (50 concurrent)
7. **JSON extraction** — All LLM-response parsers strip Markdown code fences before JSON extraction

---

## Gemini Code Review — Findings & Resolutions

| Severity | Finding | Status |
|----------|---------|--------|
| **CRITICAL** | Permissions "default allow" for required permissions — missing flags treated as allowed | **Fixed** — Changed `flags[permission] === false` to `flags[permission] !== true` |
| **CRITICAL** | Shallow parameter validation (no recursion into nested objects) | **Acknowledged** — Current tools only use flat params; tracked for future enhancement |
| **HIGH** | N+1 KV reads in `getToolMetrics` | **Fixed** — Parallelized with batched `Promise.all` (50 concurrent reads) |
| **HIGH** | Serial AI calls in `tag_chunk_docs` | **Fixed** — Parallelized with bounded concurrency (5 concurrent) |
| **MEDIUM** | JSON extraction doesn't handle Markdown code fences | **Fixed** — Added `stripMarkdownFences()` to all 3 tool parsers |
| **MEDIUM** | No `pattern`/`format` validation in parameter schema | **Acknowledged** — Not needed by current tools; tracked for future |
| **LOW** | Prompt injection risk in summarize tool | **Acknowledged** — Standard LLM limitation; mitigated by tool isolation |
| **LOW** | Type safety in vector metadata spreading | **Acknowledged** — Input restricted to `Record<string, string>` |

---

## Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `tool-dispatcher.test.ts` | 7 | Dispatch flow, timeout, error mapping, permission denial |
| `tool-permissions.test.ts` | 10 | Default-deny, per-tool flags, required permissions, cross-tenant |
| `tool-injection-guard.test.ts` | 6 | Path traversal, special chars, proto pollution, large params |
| `tool-summarize.test.ts` | 4 | Paragraph/bullet formats, defaults, metadata |
| `tool-extract-entities.test.ts` | 5 | Entity extraction, custom types, empty/malformed AI responses |
| `tool-classify-intent.test.ts` | 6 | Default/custom categories, missing confidence, fallback |
| `tool-tag-chunk-docs.test.ts` | 4 | Chunking+tagging, empty content, custom chunk_size |
| `tool-ingest-docs.test.ts` | 4 | Full pipeline, empty content, metadata passthrough |
| `tool-audit.test.ts` | 4 | Hash consistency, KV writes, graceful degradation, error codes |
| `tool-execute-endpoint.test.ts` | 8 | All 3 endpoints, error codes, handler isolation |

---

## Known Limitations / Future Work

1. **Recursive parameter validation** — `validateToolParameters` only checks top-level; nested objects pass through unvalidated. Not an issue with current tools (all flat params) but should be addressed when complex param schemas are added.
2. **Analytics Engine** — KV-based metrics works but will scale poorly past ~10K executions/day. Consider migrating to Cloudflare Analytics Engine for production.
3. **Tool result caching** — Not implemented. Identical tool calls currently always re-execute. Could add cache layer keyed on param hash.
4. **Streaming tool results** — All tools run non-streaming. Long-running tools (ingest_docs) could benefit from progress streaming.

---

## Verification Checklist

- [x] `npx vitest run` — 165 tests passing, 0 failures
- [x] `POST /tools/execute` with `summarize` returns result
- [x] `POST /tools/execute` with unknown tool returns 404
- [x] `POST /tools/execute` with invalid params returns 400
- [x] `GET /schema/tools` returns 5 tool definitions (no handlers)
- [x] `GET /metrics/tools/execution` returns aggregated metrics
- [x] `POST /chat` with `tool_name` augments LLM response with tool context
- [x] Permission denial returns 403
- [x] Audit entries written to KV with 7-day TTL
- [x] Existing 106 tests still pass (zero regressions)
