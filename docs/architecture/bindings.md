# Cloudflare Bindings Reference

Guardrails: keep tenants isolated; secrets live only in Workers Secrets; never store raw prompts in D1/KV/R2.

## mrrainbowsmoke
Account: `9acbaee838d01aa096e63ad4551fda77` — Worker: `bluey-ai-worker` — Config: `mrrainbowsmoke/wrangler.jsonc`

**Workers AI**
| Binding | Type | Notes |
|---------|------|-------|
| AI | Workers AI | Primary inference binding (`env.AI`) |

**KV Namespaces**
| Binding | ID | Preview ID | Purpose |
|---------|----|-----------|---------|
| RATE_LIMITER | 3d92856849a143d1b066ba67c3c19140 | c1b8fabe9cd04217ae9e0e7c2337e496 | Per-key/per-IP rate limiting state |
| CONFIG | fe5f8c7dc4044d98b331354e1d5d411f | 7d19664717324aadbfe8a9b6a4234228 | Feature flags, tenant allowlists, non-sensitive config |
| CACHE | 6bc11f864eb9454ebb2bc7cde047b517 | 51cc3bceff0a45ceb7dcc8485abed458 | Response caching for identical inputs |

**D1 Databases**
| Binding | Database Name | Database ID | Purpose |
|---------|--------------|-------------|---------|
| DB | mrrainbowsmoke-db | ad1db3cf-5ed8-4128-adfb-be819b3e7385 | Chat sessions + audit metadata (no raw prompts) |

**Durable Objects** (migration tag `v1`)
| Binding | Class Name | Source File | Purpose |
|---------|-----------|-------------|---------|
| RATE_LIMITER_DO | RateLimiterDO | src/durable-objects/RateLimiterDO.ts | Sliding-window rate limiting per key |
| CHAT_SESSION | ChatSessionDO | src/durable-objects/ChatSessionDO.ts | Stateful chat session history |

**Env Vars (per env)**
| Variable | Dev | Staging | Production |
|----------|-----|---------|------------|
| ENVIRONMENT | dev | staging | production |
| MODEL_ID | @cf/meta/llama-3.1-8b-instruct-fast | @cf/meta/llama-3.1-8b-instruct-fast | @cf/meta/llama-3.1-8b-instruct-fast |
| FALLBACK_MODEL_ID | @cf/meta/llama-3.1-8b-instruct | @cf/meta/llama-3.1-8b-instruct | @cf/meta/llama-3.1-8b-instruct |
| RATE_LIMIT_KEYS_PER_MINUTE | 100 | 60 | 60 |
| MAX_REQUEST_BODY_SIZE | 10240 | 10240 | 10240 |
| MAX_MESSAGE_COUNT | 50 | 50 | 50 |
| MAX_MESSAGE_LENGTH | 2000 | 2000 | 2000 |
| DEBUG_LOGGING | true | false | false |

**Secrets**
| Secret | Purpose |
|--------|---------|
| API_KEY | Bearer token for auth |
| CF_AIG_TOKEN | Optional AI Gateway auth token for external clients |

**Observability**
```json
{
  "observability": {
    "logs": {
      "enabled": true,
      "invocation_logs": true
    }
  }
}
```

## rainbowsmokeofficial
Account: `7fde695caf9cc41efca391316eb71003` — Worker: `azure-ai-worker` — Config: `rainbowsmokeofficial/wrangler.jsonc`

**Workers AI**
| Binding | Type | Notes |
|---------|------|-------|
| AI | Workers AI | Primary inference binding (`env.AI`) |

**KV Namespaces**
| Binding | ID | Preview ID | Purpose |
|---------|----|-----------|---------|
| RATE_LIMITER | 9955aa497adf42cdb06ab5e5b07912f4 | c3539b08cca2489e9aed7cca192b3578 | Per-key/per-IP rate limiting state |
| CONFIG | a2ce1cc8f7e541b9be6d94fa17535f44 | ca85772bada44f959c554439cfd02b06 | Feature flags, tenant allowlists, non-sensitive config |
| CACHE | b97e12695fba4187b01ff9e476d949cd | c0b51e78ae3245169aa24b5043e5732a | Response caching for identical inputs |

**D1 Databases**
| Binding | Database Name | Database ID | Purpose |
|---------|--------------|-------------|---------|
| DB | rainbowsmokeofficial-db | 3ccf0590-1bbd-488f-b1c4-492131b4317e | Chat sessions + audit metadata (no raw prompts) |

**Durable Objects** (migration tag `v1`)
| Binding | Class Name | Source File | Purpose |
|---------|-----------|-------------|---------|
| RATE_LIMITER_DO | RateLimiterDO | src/durable-objects/RateLimiterDO.ts | Sliding-window rate limiting per key |
| CHAT_SESSION | ChatSessionDO | src/durable-objects/ChatSessionDO.ts | Stateful chat session history |

**Env Vars (per env)**
| Variable | Dev | Staging | Production |
|----------|-----|---------|------------|
| ENVIRONMENT | dev | staging | production |
| MODEL_ID | @cf/meta/llama-3.1-8b-instruct-fast | @cf/meta/llama-3.1-8b-instruct-fast | @cf/meta/llama-3.1-8b-instruct-fast |
| FALLBACK_MODEL_ID | @cf/meta/llama-3.1-8b-instruct | @cf/meta/llama-3.1-8b-instruct | @cf/meta/llama-3.1-8b-instruct |
| RATE_LIMIT_KEYS_PER_MINUTE | 100 | 60 | 60 |
| MAX_REQUEST_BODY_SIZE | 10240 | 10240 | 10240 |
| MAX_MESSAGE_COUNT | 50 | 50 | 50 |
| MAX_MESSAGE_LENGTH | 2000 | 2000 | 2000 |
| DEBUG_LOGGING | true | false | false |

**Secrets**
| Secret | Purpose |
|--------|---------|
| API_KEY | Bearer token for auth |
| CF_AIG_TOKEN | Optional AI Gateway auth token for external clients |

**Observability**
```json
{
  "observability": {
    "logs": {
      "enabled": true,
      "invocation_logs": true
    }
  }
}
```

## Usage Notes
- Secrets never live in KV/D1/R2; use `wrangler secret put` only.
- D1 stores metadata only (roles, timestamps, token counts); no raw prompts.
- KV `CONFIG` for flags (`VECTORIZE_ENABLED`, `STREAMING_ENABLED`) and allowlists; `CACHE` keyed by hashed input with TTL per env.
- `RATE_LIMITER_DO` for precise sliding windows; `CHAT_SESSION` for sessionized chat state.
- Keep env variables in lockstep with `wrangler.jsonc` per tenant and environment.

## Environment Tag Aliases
- Development: `dev`, `develop`, `development`
- Staging: `stg`, `staging`, `preview`
- Production: `prd`, `prod`, `production`
