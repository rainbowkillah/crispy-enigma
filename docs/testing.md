# Testing Strategy

This document outlines the testing philosophy, levels, and quality gates for the project, ensuring reliability, correctness, and robust multi-tenancy.

## 1. Testing Philosophy
- **Correctness First:** Our primary goal is to ensure the system behaves as expected, especially regarding multi-tenant data isolation.
- **Test in Layers:** We use a mix of unit, integration, and end-to-end tests to validate different parts of the system.
- **Automate Everything:** All tests must be runnable via `npm test` and will be executed automatically in CI.
- **Test against Interfaces:** Tests should focus on the public contracts of modules and services, not their internal implementation details.

## 2. Testing Levels

### 2.1 Unit Tests
- **Scope:** Individual functions, classes, or modules in isolation.
- **Tools:** `vitest` with mocking for external dependencies (e.g., Cloudflare bindings).
- **Examples:**
  - Testing a utility function in `packages/core`.
  - Validating the key prefixing logic in a `packages/storage` adapter.
  - Ensuring a Zod schema in `packages/core` correctly validates input.

### 2.2 Integration Tests
- **Scope:** Interactions between multiple components, often including emulated Cloudflare services.
- **Tools:** `vitest` with `miniflare` to simulate the Workers runtime, KV, DO, and Vectorize.
- **Examples:**
  - A request flowing through the `worker-api` to the tenant resolution middleware and into a handler.
  - A chat session correctly persisting messages in a Durable Object.
  - An ingestion call that chunks data, generates an embedding (mocked), and upserts it into a Miniflare-backed Vectorize index.

### 2.3 End-to-End (E2E) Tests
- **Scope:** The entire system, from HTTP request to a deployed Worker and back.
- **Tools:** A test runner (like `vitest` or a dedicated E2E framework) making real HTTP requests to a `wrangler dev` instance or a deployed preview environment.
- **Purpose:** To validate the complete request lifecycle, including networking, configuration, and interactions between all Cloudflare services. This is the final validation that the system works as a whole.

## 3. Key Test Suites
The following test suites are critical for project success and must have comprehensive coverage.

- **Tenant Isolation Tests (Integration):**
  - Verify that a request for `tenant-a` cannot access data (KV, DO, Vectorize) belonging to `tenant-b`.
  - Ensure that API keys or hostnames correctly resolve to the right tenant context.
  - Prove that Vectorize queries using `namespace` correctly isolate results.
  - Implemented in `tests/session-isolation.test.ts`.

- **Streaming Behavior Tests (Integration/E2E):**
  - Confirm that `/chat` responses stream tokens correctly without data loss or premature termination.
  - Test handling of backpressure and connection interruptions.
  - Implemented in `tests/streaming.test.ts`.

- **Retrieval Correctness "Smoke" Tests (Integration):**
  - Use a fixed set of documents (fixtures) and queries to ensure the RAG pipeline returns deterministic and relevant results.
  - This acts as a regression test for the retrieval and ranking logic.

- **Tool Execution Guardrail Tests (Integration):**
  - Verify that the tool dispatcher correctly validates tool names and arguments.
  - Test permission gating to ensure tenants can only run tools they are authorized for.
  - Test for potential injection attacks in tool arguments.

- **Rate Limiting Tests (Integration):**
  - Confirm that the DO-based rate limiter correctly blocks requests that exceed the defined limit for a given tenant, user, or IP.
  - Implemented in `tests/rate-limit.test.ts` and `tests/rate-limiter.test.ts`.

## 4. Quality Gates (CI/CD)
The following gates will be enforced on every pull request before it can be merged.
1.  **Lint:** Code style is checked with `eslint`.
2.  **Type Check:** TypeScript compilation (`tsc --noEmit`) must pass.
3.  **Unit Tests:** All unit tests must pass.
4.  **Integration Tests:** All integration tests must pass.
5.  **Deploy Preview (Optional):** For significant changes, a preview deployment to Cloudflare may be required for manual verification or E2E testing.
