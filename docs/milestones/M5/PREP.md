# M5 Preparation: Tool & Function Execution System

**Date:** 2026-02-07  
**Status:** 📋 Planning  
**Estimated Issues:** #54–#63 (10 issues)  
**Estimated Duration:** 12–18 hours  
**Blockers:** None (M0–M4 complete)

---

## Overview

**Milestone M5** introduces a tool execution system enabling the AI to call predefined functions. This expands the `/chat` and `/search` endpoints to support function calling, allowing users to trigger actions like summarization, entity extraction, and document ingestion directly from the chat interface.

### Goals
- ✅ Define tool schema using JSON Schema (OpenAPI 3.0.0 compatible)
- ✅ Implement tool dispatcher (route requests to correct handler)
- ✅ Build 3 initial tools: `summarize`, `extract_entities`, `ingest_docs`
- ✅ Add tool calling support to `/chat` endpoint
- ✅ Add test coverage (tool dispatch, parameter validation, error handling)

### Success Criteria
- Tools callable from `/chat` endpoint
- Tool parameters validated against schema
- All 3 initial tools working correctly
- 30+ test cases covering edge cases
- Zero breaking changes to M0–M4 endpoints
- TypeScript strict mode compliant

---

## Architecture Overview

### Tool System Flow

```
User Request (/chat with tool_name)
    ↓
[Tool Dispatcher] — Route to correct tool
    ↓
[Parameter Validation] — Zod schema validation
    ↓
[Tool Handler] — Execute tool logic
    ↓
[Result Formatting] — Return structured response
    ↓
Chat Response (ok/fail envelope)
```

### Tool Definition (JSON Schema)

Each tool is defined with:
- **Name:** Unique identifier (e.g., "summarize")
- **Description:** Human-readable purpose
- **Parameters:** Input schema (JSON Schema format)
- **Output:** Return schema (JSON Schema format)
- **Timeout:** Max execution time (default: 10s)

### Tool Registry

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;      // For validation + AI context
  output: JSONSchema;           // Expected return type
  handler: (params: any, env: Env) => Promise<any>;
  timeout: number;              // milliseconds
}

// Central registry
const toolRegistry: Record<string, ToolDefinition> = { /* ... */ };
```

---

## M5 Issues Breakdown

### Phase 1: Tool Foundation (#54–#56)

#### Issue #54: Define tool schema and registry
- **Title:** Define JSON schema format for tools + create tool registry
- **Acceptance Criteria:**
  - ✅ `packages/tools/src/schema.ts` with tool definition types
  - ✅ Zod schema for tool parameters and output
  - ✅ Tool registry (in-memory map, extendable)
  - ✅ JSON Schema validator for OpenAPI 3.0.0 compatibility
- **Files to Create:**
  - `packages/tools/package.json` (new package)
  - `packages/tools/src/schema.ts`
  - `packages/tools/src/registry.ts`
- **Dependencies:** None (depends on zod, already available)
- **Tests:** 5 test cases
  - Schema validation for tool definition
  - Registry lookup by tool name
  - Invalid schema detection
  - Parameter validation

#### Issue #55: Implement tool dispatcher
- **Title:** Route tool requests to handlers with error handling
- **Acceptance Criteria:**
  - ✅ `packages/tools/src/dispatcher.ts` with route logic
  - ✅ Timeout handling (default 10s)
  - ✅ Error handling (invalid tool, missing params, timeout)
  - ✅ Structured error responses
  - ✅ Tenant scoping (all tools respect tenantId)
- **Files to Create:**
  - `packages/tools/src/dispatcher.ts`
  - `packages/tools/src/errors.ts` (tool-specific errors)
- **Dependencies:** schema registry (Issue #54)
- **Tests:** 8 test cases
  - Dispatch to valid tool
  - Invalid tool name
  - Missing required parameters
  - Extra parameters (allowed, no error)
  - Timeout handling
  - Error response structure
  - Tenant isolation
  - Concurrent tool calls

#### Issue #56: Add tool calling support to /chat endpoint
- **Title:** Wire tool calls into existing `/chat` flow
- **Acceptance Criteria:**
  - ✅ `/chat` accepts optional `tool_name` parameter
  - ✅ `/chat` accepts optional `tool_params` object
  - ✅ If tool_name present, dispatcher invoked before RAG
  - ✅ Tool result injected into chat context
  - ✅ Graceful fallback if tool call fails (revert to normal chat)
- **Files to Modify:**
  - `apps/worker-api/src/index.ts` (update chat handler)
  - `packages/core/src/schema/chat.ts` (update request schema)
- **Dependencies:** dispatcher (Issue #55)
- **Tests:** 6 test cases
  - Chat with tool call (success)
  - Chat with invalid tool
  - Tool call timeout (fallback)
  - Tool call with missing params
  - Chat without tool call (normal flow)
  - SSE response includes tool result

### Phase 2: Initial Tools (#57–#59)

#### Issue #57: Implement `summarize` tool
- **Title:** Create tool to summarize text or chat history
- **Acceptance Criteria:**
  - ✅ Input: `text` (string) or `session_id` (use chat history)
  - ✅ Output: `summary` (string), `key_points` (string[])
  - ✅ Uses existing AI Gateway for LLM call
  - ✅ Max input size: 50KB
  - ✅ Max output: 5 key points
- **Files to Create:**
  - `packages/tools/src/tools/summarize.ts`
- **Dependencies:** AI Gateway, chat session store
- **Tests:** 5 test cases
  - Summarize plain text
  - Summarize session history
  - Input size limit enforcement
  - Key point extraction
  - Invalid session ID

#### Issue #58: Implement `extract_entities` tool
- **Title:** Extract named entities (people, places, concepts) from text
- **Acceptance Criteria:**
  - ✅ Input: `text` (string), optional `entity_types` array
  - ✅ Output: `entities` (array of {type, value, confidence})
  - ✅ Default entity types: [PERSON, LOCATION, CONCEPT, DATE]
  - ✅ Confidence score (0–1)
  - ✅ Max input: 50KB
- **Files to Create:**
  - `packages/tools/src/tools/extract_entities.ts`
- **Dependencies:** AI Gateway (or alternative NER service)
- **Tests:** 5 test cases
  - Extract from plain text
  - Filter by entity type
  - Multiple entities in single text
  - Confidence scoring
  - Large text handling

#### Issue #59: Implement `ingest_docs` tool
- **Title:** Ingest documents into RAG pipeline
- **Acceptance Criteria:**
  - ✅ Input: `doc_id` (string), `content` (string), optional `metadata` (JSON)
  - ✅ Output: `status` (string), `chunks_created` (int), `vector_ids` (string[])
  - ✅ Reuses existing `/ingest` pipeline
  - ✅ Tenant-scoped (KV + Vectorize)
  - ✅ Async chunking (return immediately, process in background)
- **Files to Create:**
  - `packages/tools/src/tools/ingest_docs.ts`
- **Dependencies:** Existing RAG pipeline (M3)
- **Tests:** 5 test cases
  - Ingest new document
  - Ingest with metadata
  - Document already exists (update)
  - Chunking verification
  - Metadata storage

### Phase 3: Integration & Testing (#60–#63)

#### Issue #60: Create tool execution tests
- **Title:** Comprehensive test suite for tool dispatcher and all tools
- **Acceptance Criteria:**
  - ✅ 20+ test cases total (5 dispatcher, 5 each tool, 5 integration)
  - ✅ Mock AI Gateway responses
  - ✅ Tenant isolation verification
  - ✅ Error path coverage
  - ✅ Performance benchmarks (each tool < 5s)
- **Files to Create:**
  - `tests/tool-dispatcher.test.ts` (5 cases)
  - `tests/tool-summarize.test.ts` (5 cases)
  - `tests/tool-extract.test.ts` (5 cases)
  - `tests/tool-ingest.test.ts` (5 cases)
- **Dependencies:** All tools (Issues #57–#59)
- **Tests:** 20+ test cases (integrated)

#### Issue #61: Document tool system
- **Title:** Add tool docs to main docs/ directory
- **Acceptance Criteria:**
  - ✅ `docs/tools.md` — Tool system overview
  - ✅ `docs/tools-schema.md` — JSON Schema format + examples
  - ✅ `docs/tools-builtin.md` — Reference for all builtin tools
  - ✅ API examples in `docs/examples/tools.md`
- **Files to Create:**
  - `docs/tools.md`
  - `docs/tools-schema.md`
  - `docs/tools-builtin.md`
  - `docs/examples/tools.md`
- **Dependencies:** None
- **Tests:** 0 (documentation)

#### Issue #62: Add metrics for tool execution
- **Title:** Track tool call latency, success rate, and error distribution
- **Acceptance Criteria:**
  - ✅ Metrics: `tool.execute.latency_ms`, `tool.execute.success`, `tool.execute.error`
  - ✅ Metrics per tool name
  - ✅ Endpoint: `GET /metrics/tools/execution`
  - ✅ Grouped by tool + time period
- **Files to Modify:**
  - `packages/observability/src/metrics.ts` (add tool metrics)
  - `apps/worker-api/src/index.ts` (add metrics endpoint)
- **Dependencies:** Tool dispatcher (Issue #55)
- **Tests:** 4 test cases
  - Latency tracking
  - Success/error classification
  - Metrics aggregation
  - Time period filtering

#### Issue #63: Add tool schema to /chat schema endpoint
- **Title:** Advertise available tools to clients
- **Acceptance Criteria:**
  - ✅ `GET /schema/tools` returns all tool definitions
  - ✅ Each tool includes name, description, parameters, output schema
  - ✅ Format compatible with OpenAI function calling spec
  - ✅ Response is tenant-scoped (admin tools hidden from standard users)
- **Files to Modify:**
  - `apps/worker-api/src/index.ts` (add endpoint)
- **Dependencies:** Tool registry (Issue #54)
- **Tests:** 3 test cases
  - Schema endpoint returns all tools
  - Tool schema format validation
  - Tenant-scoped tool filtering

---

## Phase Breakdown & Timeline

### Phase 1: Foundation (4–5 hours)
| Issue | Task | Duration | Dependencies |
|-------|------|----------|---|
| #54 | Tool schema + registry | 1.5h | — |
| #55 | Tool dispatcher | 2h | #54 |
| #56 | /chat integration | 1h | #55 |
| **Total** | | **4.5h** | |

**Deliverable:** Tool system wired into `/chat`, ready for tool implementations

### Phase 2: Initial Tools (4–5 hours)
| Issue | Task | Duration | Dependencies |
|-------|------|----------|---|
| #57 | Summarize tool | 1.5h | #55 |
| #58 | Extract entities tool | 1.5h | #55 |
| #59 | Ingest docs tool | 1.5h | #55, M3 RAG |
| **Total** | | **4.5h** | |

**Deliverable:** 3 fully functional tools with parameter validation

### Phase 3: Integration & Observability (3–4 hours)
| Issue | Task | Duration | Dependencies |
|-------|------|----------|---|
| #60 | Tool tests (20+ cases) | 1.5h | #57–#59 |
| #61 | Tool documentation | 1h | #54–#59 |
| #62 | Tool metrics | 1h | #55 |
| #63 | /schema/tools endpoint | 0.5h | #54 |
| **Total** | | **4h** | |

**Deliverable:** Full test coverage, metrics, documentation, schema endpoint

### Total Timeline: 12–14 hours
- Phase 1: 4.5h (foundation)
- Phase 2: 4.5h (tools)
- Phase 3: 4h (testing + metrics)
- Buffer: 1–2h (edge cases, fixes)

---

## Risk Assessment

### 1. Tool Timeout Handling
- **Risk:** Tool call hangs (e.g., AI Gateway timeout)
- **Impact:** Chat request blocked indefinitely
- **Mitigation:** Implement 10s timeout per tool, return error envelope
- **Validation:** Timeout test in tool dispatcher suite

### 2. AI Gateway Rate Limiting
- **Risk:** Tool calls consume AI Gateway quota, blocking chat
- **Impact:** Tool calls fail, chat fallback degraded
- **Mitigation:** Tool calls use separate rate limit bucket, lower quotas
- **Validation:** Rate limit tests with mock Gateway

### 3. Tool Parameter Injection
- **Risk:** User provides malicious parameters (e.g., SQL injection)
- **Impact:** Arbitrary code execution (unlikely in LLM call, but risky)
- **Mitigation:** Strict Zod schema validation, no arbitrary code paths
- **Validation:** Adversarial test cases in parameter validation tests

### 4. KV/Vectorize Exhaustion
- **Risk:** Ingest tool creates unbounded documents
- **Impact:** Storage quota exceeded, tenant blocked
- **Mitigation:** Per-tenant quota enforcement, per-document size limits
- **Validation:** Quota tests in ingest_docs tests

### 5. Tool Naming Conflicts
- **Risk:** Tool names collide (e.g., "summarize" in different packages)
- **Impact:** Wrong tool executed
- **Mitigation:** Namespace tools (e.g., "builtin.summarize", "custom.summarize")
- **Validation:** Tool registry deduplication tests

---

## Dependencies & Prerequisites

### M0–M4 Completion
- ✅ Foundation (M0) — TypeScript, ESLint, Vitest
- ✅ Chat + Sessions (M1) — `/chat` endpoint, streaming
- ✅ Gateway (M2) — AI Gateway integration
- ✅ RAG (M3) — Chunking, embeddings, Vectorize
- ✅ Search (M4) — `/search` endpoint, caching

### External Dependencies
- ✅ Zod (schema validation) — Already in package.json
- ✅ AI Gateway — Already integrated (M2)
- ✅ KV + Vectorize — Already bound in wrangler.jsonc

### No New Blockers
All required services and packages are available from M0–M4.

---

## File Structure

### New Files
```
packages/tools/                     ← New package
├── package.json
├── src/
│   ├── schema.ts                   ← Tool definition types + Zod
│   ├── registry.ts                 ← Central tool registry
│   ├── dispatcher.ts               ← Tool routing + execution
│   ├── errors.ts                   ← Tool-specific errors
│   └── tools/
│       ├── summarize.ts            ← Summarization tool
│       ├── extract_entities.ts     ← Entity extraction tool
│       └── ingest_docs.ts          ← Document ingestion tool
└── (no tests; use root tests/)

tests/
├── tool-dispatcher.test.ts         ← Dispatcher tests (5 cases)
├── tool-summarize.test.ts          ← Summarize tool tests (5 cases)
├── tool-extract.test.ts            ← Extract tool tests (5 cases)
├── tool-ingest.test.ts             ← Ingest tool tests (5 cases)
└── tool-integration.test.ts        ← End-to-end tests (5 cases)

docs/
├── tools.md                        ← Overview
├── tools-schema.md                 ← JSON Schema format
├── tools-builtin.md                ← Tool reference
└── examples/
    └── tools.md                    ← Usage examples
```

### Modified Files
```
apps/worker-api/src/index.ts        ← Add /chat tool params, /schema/tools endpoint
packages/core/src/schema/chat.ts    ← Add tool_name, tool_params to request
packages/observability/src/metrics.ts ← Add tool metrics
nx.json                             ← If @nx/npm needed for tools package
tsconfig.base.json                  ← Add tools package path
```

---

## Validation Strategy

### Unit Tests (20+ cases)
- Tool schema validation (5 cases)
- Tool dispatcher routing (5 cases)
- Summarize tool (5 cases)
- Extract entities tool (5 cases)
- Ingest docs tool (5 cases)

### Integration Tests (5 cases)
- /chat with summarize tool
- /chat with extract tool
- /chat with ingest tool
- Tool timeout handling
- Invalid tool name fallback

### Performance Benchmarks
- Each tool completes in < 5s average
- summarize: < 2s (LLM call)
- extract_entities: < 1s (entity NER)
- ingest_docs: < 3s (chunking + Vectorize)

### Security Validation
- Parameter injection prevented (Zod)
- Tenant isolation enforced
- No unhandled errors
- No sensitive data in logs

---

## Success Criteria Checklist

- [ ] Issue #54: Tool schema + registry defined
- [ ] Issue #55: Tool dispatcher implemented
- [ ] Issue #56: /chat endpoint supports tool calls
- [ ] Issue #57: Summarize tool working
- [ ] Issue #58: Extract entities tool working
- [ ] Issue #59: Ingest docs tool working
- [ ] Issue #60: 20+ test cases passing
- [ ] Issue #61: Documentation complete
- [ ] Issue #62: Tool metrics tracked
- [ ] Issue #63: /schema/tools endpoint working
- [ ] All 85+ existing tests still passing
- [ ] TypeScript strict mode clean
- [ ] Zero breaking changes to M0–M4 APIs

---

## Next Steps (After M5)

### M6: Text-to-Speech (TTS) Adapter
- Define `/tts` endpoint contract
- Implement adapter interface for different TTS providers
- Initial provider: Cloudflare TTS (if available)

### M7: Observability & Metrics Finalization
- Consolidate all metrics endpoints
- Add structured logging
- Implement log redaction for sensitive fields
- Add dashboard/monitoring docs

### M8+: Tool Extensions
- Custom tool registration (admin-only)
- Tool versioning & deprecation
- Tool marketplace
- Advanced features (conditional execution, chaining)

---

## Codex Execution Plan

When ready to implement M5 with Codex:

1. **Phase 1 Kickoff:**
   - Start with Issue #54 (schema + registry)
   - Reference existing schema patterns from M1 (chat request schema)
   - Use Zod schema from packages/core as model

2. **Phase 2 Kickoff:**
   - Reference existing tool-like patterns from RAG (chunking)
   - Use AI Gateway integration from M2 as template
   - Mock KV/Vectorize as in existing tests

3. **Phase 3 Kickoff:**
   - Generate tests from existing test patterns
   - Reference M4 metrics implementation for tool metrics
   - Follow established error handling patterns from M1/M2

---

## Summary

M5 introduces a flexible tool execution system enabling AI-driven function calls. The architecture is transaction-safe, tenant-scoped, and integrates cleanly with existing M0–M4 foundation.

**Status:** Ready for Phase 1 implementation  
**Timeline:** 12–14 hours (3 phases)  
**Blockers:** None  
**Next Validation:** Full test suite + staging validation with live Gateway

