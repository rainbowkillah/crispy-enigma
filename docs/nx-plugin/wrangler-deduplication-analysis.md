# Wrangler Deduplication Analysis

The current `wrangler.jsonc` files (e.g., `tenants/mrrainbowsmoke/wrangler.jsonc`) are approximately 542 lines long, with significant duplication across 9 environments.

## Current Structure

Each tenant `wrangler.jsonc` defines:
*   **Base Config**: `name`, `main`, `compatibility_date`, `account_id`, `vars`, `observability`.
*   **Base Bindings**: `ai`, `vectorize`, `kv_namespaces`, `d1_databases`, `durable_objects`.
*   **Environment Overrides**: 9 environments (`dev`, `develop`, `development`, `staging`, `stg`, `preview`, `prod`, `prd`, `production`).
    *   Each environment **redeploys** the *entire* list of bindings (KV, D1, Vectorize, DO) just to add `"remote": true` (or identical IDs).
    *   Each environment **redefines** all `vars`.

## Proposed Structure (Reduced)

We can reduce this file to <200 lines by:
1.  **Defining Canonical Environments**: Only use `dev`, `staging`, `production`. Map other aliases in the Nx executor or CI pipeline.
2.  **Inheritance/Base Vars**: Define common vars at the top level. Only override specific vars (like `ENVIRONMENT`, `DEBUG_LOGGING`) in environments.
3.  **Binding Deduplication**:
    *   Wrangler merges top-level bindings with environment bindings. If IDs are the same, we don't need to repeat them unless we are changing them (e.g., using a different KV ID for prod vs dev).
    *   However, `mrrainbowsmoke` uses the *same* IDs for all environments (likely a single-tenant setup per worker, or just using same resources for simplicity in this codebase).
    *   If IDs *are* different, we must specify them. But for `mrrainbowsmoke`, they appear identical in `id` and `preview_id` across `dev`, `staging`, `prod`.

### Proposed Template (<200 lines)

```jsonc
{
  "name": "mrrainbowsmoke-worker",
  "main": "../../apps/worker-api/src/index.ts",
  "compatibility_date": "2026-02-01",
  "account_id": "9acbaee838d01aa096e63ad4551fda77",
  "vars": {
    "MODEL_ID": "@cf/meta/llama-3.1-8b-instruct-fast",
    "FALLBACK_MODEL_ID": "@cf/meta/llama-3.1-8b-instruct",
    "RATE_LIMIT_KEYS_PER_MINUTE": 60,
    "MAX_REQUEST_BODY_SIZE": 10240,
    "MAX_MESSAGE_COUNT": 50,
    "MAX_MESSAGE_LENGTH": 2000,
    "DEBUG_LOGGING": false,
    "ENVIRONMENT": "production" // Default
  },
  "observability": {
    "logs": {
      "enabled": true,
      "invocation_logs": true
    }
  },
  // Shared Bindings (apply to all envs unless overridden)
  "ai": { "binding": "AI" },
  "vectorize": [
    { "binding": "VECTORIZE", "index_name": "mrrainbowsmoke" }
  ],
  "kv_namespaces": [
    { "binding": "RATE_LIMITER", "id": "3d92856849a143d1b066ba67c3c19140", "preview_id": "c1b8fabe9cd04217ae9e0e7c2337e496" },
    { "binding": "CONFIG", "id": "fe5f8c7dc4044d98b331354e1d5d411f", "preview_id": "7d19664717324aadbfe8a9b6a4234228" },
    { "binding": "CACHE", "id": "6bc11f864eb9454ebb2bc7cde047b517", "preview_id": "51cc3bceff0a45ceb7dcc8485abed458" }
  ],
  "d1_databases": [
    { "binding": "DB", "database_name": "mrrainbowsmoke-db", "database_id": "ad1db3cf-5ed8-4128-adfb-be819b3e7385" }
  ],
  "durable_objects": {
    "bindings": [
      { "name": "RATE_LIMITER_DO", "class_name": "RateLimiter" },
      { "name": "CHAT_SESSION", "class_name": "ChatSession" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["RateLimiter", "ChatSession"] }
  ],
  // Environment Overrides
  "env": {
    "dev": {
      "vars": {
        "ENVIRONMENT": "dev",
        "DEBUG_LOGGING": true,
        "RATE_LIMIT_KEYS_PER_MINUTE": 100
      },
      // Override vector index for dev if needed
      "vectorize": [
        { "binding": "VECTORIZE", "index_name": "mrrainbowsmoke-dev" }
      ]
    },
    "staging": {
      "vars": { "ENVIRONMENT": "staging" },
       "vectorize": [
        { "binding": "VECTORIZE", "index_name": "mrrainbowsmoke-stg" }
      ]
    }
    // "production" inherits base config
  }
}
```

### Savings

*   **Lines**: Reduced from ~540 to ~80.
*   **Maintenance**: Update vars in one place.
*   **Clarity**: Easier to see what is different between environments.

### Implementation Strategy

1.  **Nx Plugin**: The `nx deploy` executor should map `--env=stg` to `wrangler deploy --env staging`.
2.  **Aliases**: Remove alias environments (`prd`, `development`, etc.) from `wrangler.jsonc` and handle them in the CLI layer if necessary, or just standardize on `dev`, `staging`, `prod`.
