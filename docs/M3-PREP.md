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
- RAG assembly with prompt templates + source citations.
- Tenant isolation via Vectorize namespaces.
- Tests for retrieval correctness, tenant isolation, and RAG formatting.

---

## Prep Checklist (Draft)

- [ ] Define ingestion contract (inputs, chunking strategy, metadata schema).
- [ ] Define retrieval contract (query structure, topK, filtering rules).
- [ ] Choose prompt templates + citation formatting rules.
- [ ] Decide Vectorize index + namespace strategy per tenant.
- [ ] Add M3 test plan (unit + integration).
- [ ] Add docs for ingestion + retrieval + citations.

---

## Risks

- Vectorize limits (metadata size, topK) may constrain payload shape.
- Latency in embed + query pipeline may exceed target budgets.
- Citation formatting must be stable for downstream clients.

---

## Validation Plan (Draft)

- Ingestion of sample documents to Vectorize (per-tenant namespace).
- Retrieval returns only tenant-specific records.
- RAG response includes citations with stable IDs.
- Verify end-to-end latency and error handling.

---

## Notes

- M3 scope should align with `docs/plan.md` and `docs/milestones.md`.
- Final deliverables and acceptance criteria to be finalized after M2 spike.
