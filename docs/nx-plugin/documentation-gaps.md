# Documentation Gaps Report

This report highlights areas where documentation is missing or insufficient for the Nx plugin development.

## 1. Missing READMEs

The following packages lack a `README.md` file explaining their purpose, installation, and usage:

*   `packages/core/`
*   `packages/ai/`
*   `packages/observability/`
*   `packages/rag/`
*   `packages/storage/`
*   `packages/tools/`
*   `packages/tts/`
*   `apps/worker-api/`

**Action**: Generate a standard `README.md` for each package using the Nx plugin.

## 2. API Documentation (JSDoc)

### `apps/worker-api/src/index.ts`
*   **Gap**: The main `fetch` handler has no JSDoc explaining the supported routes, request/response formats, or headers.
*   **Impact**: Developers must read the implementation to understand how to interact with the API.

### `packages/core/src/env.ts`
*   **Gap**: `Env` interface properties are not documented.
*   **Impact**: Not clear what `CONFIG`, `CACHE`, etc., are used for without searching the codebase.

### `packages/tools/src/dispatcher.ts`
*   **Gap**: `dispatchTool` options (`timeoutMs`) are not fully documented.
*   **Impact**: Developers might not know how to configure timeouts.

## 3. Configuration Documentation

### `tenant.config.json`
*   **Gap**: The schema is defined in `scripts/validate-config.mjs` (Zod), but there is no generated documentation or example file explaining each field (e.g., `tokenBudget`, `featureFlags`).
*   **Impact**: New tenants are hard to configure without copying an existing one.

### `wrangler.jsonc`
*   **Gap**: The massive duplication obscures which settings are actually important vs. boilerplate.
*   **Impact**: Hard to maintain and update.

## 4. Error Handling

*   **Gap**: API error codes (e.g., `tenant_required`, `model_not_allowed`, `rate_limited`) are strings in the code.
*   **Impact**: No central reference for possible error codes for API consumers.

## 5. Deployment Scripts

*   **Gap**: `scripts/deploy-all.mjs` and `deploy-tenant.mjs` usage is only documented via `-h`.
*   **Impact**: CI/CD pipeline integration details are hidden in script implementation.
