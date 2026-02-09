# Refactoring Opportunities Report

This report identifies key areas for refactoring in the `crispy-enigma` codebase to prepare for an Nx migration.

## Priority 1: Core Patterns to Formalize

### 1. `packages/core/src/env.ts` (Env Type)

*   **Current State**: Manually defined `Env` interface with bindings like `AI`, `VECTORIZE`, `KVNamespace`s, `DurableObjectNamespace`s, and configuration variables.
*   **Duplication**: The interface repeats binding names found in `wrangler.jsonc`.
*   **Type Gaps**: `CONFIG`, `CACHE`, `RATE_LIMITER` are typed as `KVNamespace`, but their specific keys/values are not typed. `AI` is typed as `Ai` (from `@cloudflare/workers-types` presumably), but specific models are stringly typed.
*   **Config Drift**: If a new binding is added to `wrangler.jsonc`, `Env` must be manually updated.
*   **Simplification**: Auto-generate `Env` interface from `wrangler.jsonc` or a central schema definition using the Nx plugin.

### 2. Tenant Resolution (`packages/core/src/tenant/`)

*   **Current State**: `resolveTenant.ts` uses headers (`x-tenant-id`, `x-api-key`) or hostname to resolve a tenant. `loader.ts` validates config against a Zod schema.
*   **Duplication**: Tenant configuration schema (`tenant.config.json`) is defined in Zod but also implicitly in `wrangler.jsonc` (vars).
*   **Refactoring**: Move tenant resolution logic into a reusable middleware or higher-order function that can be applied to any worker, not just `worker-api`.

### 3. Scripts (`scripts/*.mjs`)

*   **Current State**: Custom Node.js scripts (`validate-config.mjs`, `deploy-tenant.mjs`, `deploy-all.mjs`) handle validation, build, and deployment.
*   **Duplication**: Argument parsing logic is repeated.
*   **Refactoring**:
    *   Convert `validate-config.mjs` to an Nx executor: `@crispy/nx-cloudflare:validate`.
    *   Convert `deploy-tenant.mjs` to an Nx executor: `@crispy/nx-cloudflare:deploy`.
    *   `deploy-all.mjs` logic can be handled by `nx run-many -t deploy`.

### 4. Wrangler Configuration (`wrangler.jsonc`)

*   **Current State**: Massive duplication (542+ lines per tenant). Defines 9 environments (`dev`, `develop`, `development`, `staging`, `stg`, `preview`, `prod`, `prd`, `production`) which are mostly identical aliases.
*   **Duplication**: Bindings and vars are repeated for every environment.
*   **Refactoring**: See [Wrangler Deduplication Analysis](./wrangler-deduplication-analysis.md).

## Priority 2: Worker Patterns

### 1. `apps/worker-api/src/index.ts` (Entry Point)

*   **Current State**: Monolithic file (approx. 500 lines) handling routing, middleware, and business logic for `/chat`, `/health`, `/metrics`, `/tools`, `/tts`, `/ingest`, `/search`.
*   **Duplication**: Route matching logic (`if (url.pathname === ...)`). Error handling logic (try-catch blocks with `fail(...)`).
*   **Refactoring**:
    *   Implement a proper router (e.g., `itty-router` or Hono) to handle routing.
    *   Middleware for authentication, tenant resolution, and error handling.
    *   Split route handlers into separate files (`routes/chat.ts`, `routes/search.ts`, etc.).

### 2. Durable Objects

*   **Current State**: `ChatSession` and `RateLimiter` are imported from `./session-do` and `./rate-limiter-do` in `apps/worker-api/src/`.
*   **Refactoring**: Ensure these DO classes are properly isolated and reusable. If they are generic, move them to `packages/storage/src/do/` or similar.

## Priority 3: Package APIs

### 1. `packages/tools/src/dispatcher.ts`

*   **Current State**: Handles tool execution with timeouts and permissions.
*   **Refactoring**: Make `dispatchTool` more generic to support different tool registries or contexts.

### 2. `packages/storage/src/`

*   **Current State**: Adapters for KV, DO, Vectorize.
*   **Refactoring**: Ensure strict typing for keys/values where possible.
