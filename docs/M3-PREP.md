# M3 Preparation Report

**Report Date:** 2026-02-07  
**Status:** Draft  
**Milestone:** M3 — Embeddings, Vectorize & RAG

---

## Objective

Prepare the scope, risks, and validation plan for M3: ingestion + embeddings, Vectorize retrieval, and RAG response assembly with citations.

---

## Dependencies / Blockers

- M2 Issue #25 (AI Gateway spike) still pending. M3 should not ship without validated gateway behavior in staging.
- Vectorize remote bindings verified in dev; local Vectorize remains unsupported in Wrangler local mode.

---

## Proposed Deliverables (M3)

- Embeddings generation using Workers AI (gateway-routed).
- Vectorize ingestion pipeline (chunking → embedding → upsert).
- Retrieval pipeline (query → embed → Vectorize query).
- Optional rerank hook interface.
- RAG assembly with prompt templates + source citations.
- Basic safety filters in RAG assembly.
- Tenant isolation via Vectorize namespaces.
- Tests for retrieval correctness, tenant isolation, and metadata integrity.
- Docs for Vectorize local emulation limitations + staging strategy.

---

## Prep Checklist (Full)

### Prerequisite
- [x] Complete M2 Issue #25 (AI Gateway staging spike). Gateway dashboard metadata check is a manual follow-up.

### M3 Issues (from Project Board)
- [ ] #32 Implement ingestion pipeline (chunking strategy)
- [ ] #33 Implement embedding generation
- [ ] #34 Implement Vectorize upsert with metadata
- [ ] #35 Implement retrieval pipeline (query embedding)
- [ ] #36 Implement Vectorize search
- [ ] #37 Add optional rerank hook interface
- [ ] #38 Implement RAG response assembly with prompt template
- [ ] #39 Add citations to RAG responses
- [ ] #40 Implement basic safety filters
- [ ] #41 Ensure Vectorize indexes are tenant-scoped
- [ ] #42 Create deterministic fixture retrieval tests
- [ ] #43 Create tenant isolation tests for Vectorize
- [ ] #44 Create metadata integrity tests
- [ ] #45 Document Vectorize local emulation limitations + staging strategy

---

## Risks

- Vectorize limits (metadata size, topK) may constrain payload shape.
- Latency in embed + query pipeline may exceed target budgets.
- Citation formatting must be stable for downstream clients.

---

## Acceptance Criteria (Draft)

- Ingestion pipeline accepts documents and produces deterministic chunk metadata.
- Embeddings are generated through AI Gateway for every chunk.
- Vectorize upserts include required metadata (tenantId, docId, chunkId, source).
- Retrieval returns only tenant-scoped results and honors topK limits.
- RAG responses include citations with stable IDs and correct source attribution.
- Safety filters block disallowed content at assembly time.
- Deterministic fixture retrieval tests pass consistently.
- Tenant isolation tests prove no cross-tenant leakage.
- Metadata integrity tests validate required fields and sizes.
- Documentation clearly states Vectorize local emulation limits + staging strategy.

---

## Notes

- M3 scope should align with `docs/plan.md` and `docs/milestones.md`.
- Do not start M3 implementation until M2 #25 is complete.
