# Refactoring Opportunities

## High Priority

### 1. Monolithic Worker Entry Point
**Severity**: 🔴 Critical
**Location**: `apps/worker-api/src/index.ts` (approx. 800+ lines)

**Current Pattern**:
A single `fetch` handler contains all routing logic (`/chat`, `/search`, `/metrics`, `/tools`, `/tts`), validation, error handling, and business logic.

**Issue**:
- Hard to maintain and test.
- High cognitive load.
- specific route logic is mixed with global concerns (CORS, tenant resolution).

**Recommended Pattern**:
Split into a router/controller pattern.
```typescript
// apps/worker-api/src/routes/chat.ts
export async function handleChat(req: Request, ctx: Context) { ... }

// apps/worker-api/src/router.ts
router.post('/chat', handleChat);
```

**Benefit**: Improves maintainability and allows for easier addition of new routes.
**Effort**: 3 days

### 2. Global Tool Registry Risk
**Severity**: 🟡 Medium
**Location**: `packages/tools/src/registry.ts`

**Current Pattern**:
```typescript
const registry = new Map<string, ToolDefinition>();
```
**Issue**:
- Uses a global mutable `Map`. In Cloudflare Workers, global scope persists across requests on the same isolate.
- While current tools seem generic, this invites "tenant pollution" if dynamic registration is ever added.

**Recommended Pattern**:
- Keep `registry` read-only after bootstrap.
- Or, move registry to a `Context` object passed down, instantiated per request or lazily.

**Benefit**: Ensures strict tenant isolation and prevents cross-tenant data leaks via tool definitions.
**Effort**: 1 day

## Medium Priority

### 3. Unused D1 Database Binding
**Severity**: 🟡 Medium
**Location**: `packages/core/src/env.ts`

**Current Pattern**:
`DB: D1Database` is defined in `Env` and mocked in tests, but zero usage found in source code.

**Issue**:
- Dead code/configuration.
- Confusing for new developers (should I use D1?).

**Recommended Pattern**:
Remove it if not used, or implement the intended usage.

**Benefit**: Cleanup.
**Effort**: 1 hour

### 4. AI Gateway Type Looseness
**Severity**: 🟡 Medium
**Location**: `packages/ai/src/gateway.ts`

**Current Pattern**:
```typescript
env.AI as unknown as { run: ... }
```
**Issue**:
- Bypassing TypeScript checks for the `AI` binding.
- Prone to runtime errors if Cloudflare types change.

**Recommended Pattern**:
- Use proper `@cloudflare/workers-types` definitions.
- Create a strict wrapper/adapter for `env.AI`.

**Benefit**: Type safety.
**Effort**: 4 hours

## Low Priority

### 5. Inconsistent Helper Locations
**Severity**: 🟢 Low
**Location**: `apps/worker-api/src/index.ts`

**Current Pattern**:
Helpers like `sseEvent`, `extractJsonArray`, `computeConfidence` are defined locally in `index.ts`.

**Issue**:
- Clutters the main file.
- Not reusable.

**Recommended Pattern**:
Move to `packages/core/src/utils` or `packages/ai/src/utils`.

**Benefit**: Code reuse and cleaner entry point.
**Effort**: 2 hours
