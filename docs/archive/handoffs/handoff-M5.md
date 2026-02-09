# Handoff: M5 Tool/Function Execution (Claude)

**Date:** 2026-02-08  
**Owner:** Claude (plan, architecture, implementation)  
**Scope:** M5 — Tool & Function Execution System (Issues #54–#63)

---

## ✅ M4 Completion Confirmation
Source of truth: `docs/milestones/M4/STATUS.md` (dated **2026-02-07**).

- **M4 status:** ✅ COMPLETE and production-ready.
- **Search endpoint issues (#46–#53):** all implemented, tested, and merged.
- **Test suite:** 85/85 passing.
- **Repo cleanup:** Phases 1–3 complete (artifacts removed, docs consolidated, milestones reorganized).

**Note:** The *staging validation checklist* in `docs/milestones/M4/STATUS.md` is still unchecked. If you consider staging validation a required “task,” that remains to be executed; otherwise all M4 implementation tasks are done.

---

## Current State of M5 Work (Important)
M5 prep assumes a new tools package, but **`packages/tools` already exists** and includes:

- `packages/tools/src/schema.ts` — JSON Schema types + Zod validation + parameter validation helper.
- `packages/tools/src/registry.ts` — in‑memory registry with validation + list/lookup helpers.
- `packages/tools/package.json` — exports `schema` + `registry`.

This means Issue **#54** is *partially implemented already*. Verify and extend rather than recreate.

---

## M5 Master Plan (from `docs/milestones/M5/PREP.md`)
Primary design/spec source: `docs/milestones/M5/PREP.md`.

### Phase 1: Foundation (Issues #54–#56)
1. **#54** Tool schema + registry
2. **#55** Dispatcher + error handling + timeout
3. **#56** `/chat` integration + tool request params

### Phase 2: Built-in Tools (Issues #57–#59)
1. **#57** `summarize`
2. **#58** `extract_entities`
3. **#59** `ingest_docs`

### Phase 3: Integration & Observability (Issues #60–#63)
1. **#60** Test suite (20+ cases)
2. **#61** Docs
3. **#62** Metrics + `/metrics/tools/execution`
4. **#63** `/schema/tools` endpoint

---

## Key Files & Integration Points

### Likely touched files
- `apps/worker-api/src/index.ts` — `/chat` tool params, `/schema/tools`, `/metrics/tools/execution`
- `packages/core/src/chat/schema.ts` — add `tool_name`, `tool_params`
- `packages/tools/src/dispatcher.ts` — create
- `packages/tools/src/errors.ts` — create
- `packages/tools/src/tools/*` — tool implementations
- `packages/observability/src/metrics.ts` — tool metrics aggregation
- `tests/*` — tool suite

### M5 dependency references
- `/chat` flow: `apps/worker-api/src/index.ts`
- AI Gateway usage (M2): see existing gateway integration in worker-api
- RAG ingest pipeline (M3): reuse existing ingest logic

---

## Architecture Notes (expected behaviors)

- Tool definitions should be JSON Schema (OpenAPI‑ish). Existing schema helper already in `packages/tools`.
- Dispatcher must:
  - validate params
  - enforce timeouts (default 10s)
  - return structured `ToolResult`
  - enforce tenant isolation
- `/chat` should accept optional tool params:
  - `tool_name?: string`
  - `tool_params?: Record<string, unknown>`
  - If tool fails, fall back to normal chat
- `/schema/tools` should return available tool schemas (tenant‑filtered).
- Metrics should track per‑tool latency + success/error rates.

---

## Suggested Implementation Order

1. **Audit existing `packages/tools`** schema + registry. Extend as needed for dispatcher.
2. Implement **dispatcher + errors**.
3. Update **chat request schema** + **/chat handler**.
4. Implement 3 builtin tools.
5. Add tests (dispatcher + each tool + integration).
6. Add **metrics** + **/schema/tools**.
7. Add docs under `docs/`.

---

## Testing (Use Nx)
- Unit/integration tests:
  - `nx run worker-api:test`
  - `nx run tools:test`
- Full suite (if needed):
  - `nx run-many -t test`

---

## Monorepo Guidance
When unsure about workspace structure, **use nx‑mcp tools** to inspect projects and targets. (This is a required instruction.)

---

## Open Decisions / Questions
- Should tools be namespaced (e.g., `builtin.summarize`)? M5 PREP suggests this as a risk mitigation.
- Tool permissions: how do we represent/verify per-tenant entitlements?
- Tool output envelope vs. direct payload — align with existing chat response schema.

---

## References
- M5 plan/spec: `docs/milestones/M5/PREP.md`
- M4 completion: `docs/milestones/M4/STATUS.md`
- API architecture: `docs/architecture/architecture.md`
- API reference: `docs/guides/api-reference.md`
