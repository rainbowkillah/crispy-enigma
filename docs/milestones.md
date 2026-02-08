# Project Milestones

This document outlines the major milestones for the project, derived from the detailed `plan.md`. Each milestone represents a significant, deliverable increment of functionality.

## M0: Foundation & Tenant Resolution
The foundational milestone establishes the monorepo structure, core tooling, and the critical tenant resolution middleware.
- **Deliverables:**
  - Monorepo skeleton (`apps`, `packages`, `tenants`).
  - TypeScript, ESLint, Prettier, and Vitest configuration.
  - Tenant resolution middleware that rejects requests without a valid tenant context.
  - `tenant.config.json` schema definition.
  - Local development environment via `wrangler dev`.

## M1: Streaming Chat & Sessions
This milestone introduces the first core AI feature: stateful, streaming chat.
- **Deliverables:**
  - `/chat` endpoint with streaming Server-Sent Events (SSE) or chunked responses.
  - Durable Object-based session store for conversation history, scoped per tenant.
  - DO-based rate limiter to protect the service, configurable per tenant.
  - KV cache layer for tenant-scoped data.
See `docs/milestones/M1.md` for the completion summary.

## M2: AI Gateway Integration
Integrate with Cloudflare's AI Gateway to manage model access, observability, and policy enforcement.
- **Deliverables:**
  - All Workers AI calls routed through the AI Gateway.
  - Model routing logic based on tenant configuration.
  - Hooks for budget, limit, and observability data from the gateway.

## M3: Embeddings, Vectorize & RAG
Build the Retrieval-Augmented Generation (RAG) pipeline for AI Search capabilities.
- **Status:** ✅ Complete (2026-02-07)
- **Deliverables:**
  - Ingestion pipeline for chunking text, generating embeddings, and upserting into Vectorize.
  - Retrieval pipeline for querying Vectorize.
  - RAG response assembly with prompt templates and source citations.
  - Tenant isolation enforced at the Vectorize level using namespaces.
- **Prep:** `docs/M3-PREP.md` (draft)
- **Vectorize Dev Notes:** `docs/vectorize-dev.md`

## M4: AI Search Endpoint
Expose the RAG pipeline through a user-facing `/search` endpoint.
- **Status:** ✅ Complete (2026-02-07)
- **Deliverables:**
  - `/search` endpoint with a structured response (answer, sources, confidence).
  - Query rewriting and intent detection capabilities.
  - Tenant-scoped KV caching for common search queries.

## M5: Tool & Function Execution
Implement a system for the AI to execute predefined tools (functions).
- **Status:** ✅ Complete (2026-02-08)
- **Deliverables:**
  - A tool registry and dispatcher.
  - JSON schema for defining tools and their arguments.
  - Initial tools such as `summarize`, `extract_entities`, and `ingest_docs`.
  - Audit logging for all tool executions.

## M6: TTS Adapter Interface
Define a standard interface for Text-to-Speech (TTS) functionality.
- **Status:** ✅ Complete (2026-02-08)
- **Deliverables:**
  - `/tts` API endpoint contract.
  - An adapter interface to allow for different TTS provider implementations.
  - A stub implementation that returns a "not enabled" error if no provider is configured.

## M7: Observability & Metrics
Finalize and implement the comprehensive observability strategy.
- **Status:** ✅ Complete (2026-02-08)
- **Deliverables:**
  - Structured JSON logging with correlation IDs.
  - Core metrics for API usage, AI costs, and RAG performance.
  - SLI aggregation, alert rules, anomaly detection, and overview endpoints.
  - Load testing scripts and a retrieval quality regression suite.
  - CI gates for linting, type checking, and automated testing.

## M8: Deployment Automation
Automate the deployment process for tenants to ensure repeatability and safety.
- **Status:** ✅ Complete (staging + production validated) (2026-02-08)
- **Deliverables:**
  - Scripts to deploy a single tenant or all tenants.
  - Environment selection (`dev`, `stage`, `prod`).
  - Configuration validation and drift detection.
  - Runbooks for deployment and incident response.
