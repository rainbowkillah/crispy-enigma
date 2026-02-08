# Gemini Refactoring & Documentation Review Prompt

## Context
You are paired with Claude (Architect) to review the crispy-enigma monorepo for Phase NX preparation. This is a multi-tenant Cloudflare Workers AI monorepo that needs an Nx plugin to formalize its patterns.

## Your Role: Documentation & Refactoring Analyst
Analyze the existing codebase and produce documentation that will guide the NX plugin development team (Claude, Codex, Gemini, Copilot).

## Files to Review

### Priority 1: Core Patterns to Formalize
- `packages/core/src/env.ts` — Env type (single source of truth for bindings)
- `packages/core/src/tenant.ts` — Tenant resolution middleware
- `packages/core/src/types.ts` — Shared types
- `scripts/validate-config.mjs` — Config validation (Zod schemas)
- `scripts/deploy-tenant.mjs` — Single tenant deploy
- `scripts/deploy-all.mjs` — Multi-tenant deploy
- `tenants/mrrainbowsmoke/tenant.config.json` — Tenant config example
- `tenants/mrrainbowsmoke/wrangler.jsonc` — Wrangler config (542 lines, heavy duplication)

### Priority 2: Worker Patterns
- `apps/worker-api/src/index.ts` — Entry point and middleware chain
- `apps/worker-api/src/routes/` — Route handlers
- `apps/worker-api/src/durable-objects/` — DO implementations

### Priority 3: Package APIs
- `packages/storage/src/` — KV/DO/Vectorize adapters
- `packages/ai/src/` — AI Gateway wrapper
- `packages/rag/src/` — RAG pipeline
- `packages/tools/src/` — Tool dispatcher
- `packages/observability/src/` — Metrics/logging

## Deliverables

### 1. Refactoring Opportunities Report (`docs/nx-plugin/refactoring-opportunities.md`)
For each file/pattern, identify:
- **Current state**: What it does, how it's structured
- **Duplication**: Repeated patterns that the NX plugin should generate
- **Type gaps**: Missing types, any `any` usage, type drift risks
- **Config drift**: Where tenant configs could diverge from templates
- **Simplification**: What could be auto-generated vs hand-written

### 2. Documentation Gaps Report (`docs/nx-plugin/documentation-gaps.md`)
- Functions missing JSDoc
- Public APIs without usage examples
- Configuration options not documented
- Error paths not documented
- Missing README files per package

### 3. NX Generator Input Map (`docs/nx-plugin/generator-input-map.md`)
Map existing manual patterns to NX generator equivalents:
- "To add a tenant, I currently do X" → `nx g @crispy/nx-cloudflare:tenant`
- "To add a KV binding, I edit Y" → `nx g @crispy/nx-cloudflare:binding --type=kv`
- "To deploy, I run Z" → `nx run deploy-all --env=stg`

### 4. Wrangler.jsonc Deduplication Analysis
The current wrangler.jsonc per tenant is 542 lines with massive env duplication.
Analyze and propose a template that:
- Reduces to <200 lines
- Uses wrangler config inheritance where possible
- Keeps comments for developer guidance
- Marks placeholder values clearly

## Output Format
Produce markdown files in `docs/nx-plugin/` directory.
Use tables, code blocks, and checklists for clarity.
Flag critical items with ⚠️ and suggestions with 💡.
