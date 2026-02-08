# Tenant Isolation Audit

**Date**: February 8, 2026
**Status**: 🟢 PASS with Warnings

## Executive Summary
The codebase exhibits a strong "Security by Design" approach to multi-tenancy. All storage adapters enforce `tenantId` parameters. Key isolation mechanisms are verified by dedicated test suites.

## Audit Checklist

### 1. Storage Isolation
- [x] **KV Namespace**: `TenantKVAdapter` (packages/storage/src/kv.ts) enforces `${tenantId}:${key}` pattern.
- [x] **Durable Objects**: `getTenantDurableObject` (packages/storage/src/do.ts) enforces `${tenantId}:${objectId}` naming.
- [x] **Vectorize**: `TenantVectorizeAdapter` (packages/storage/src/vectorize.ts) adds metadata filters and wraps upserts/queries.
- [x] **Search Cache**: Keys are prefixed with `tenantId`.

### 2. Request Isolation
- [x] **Tenant Resolution**: `resolveTenant` (packages/core) correctly identifies tenant from Host or API Key.
- [x] **Context Propagation**: `tenantId` is passed explicitly to `Logger`, `Metrics`, and `AI Gateway`. No reliance on global state for tenant context.

### 3. Tool Execution
- [x] **Context**: `dispatchTool` receives a `ToolContext` containing `tenantId`.
- [x] **Implementations**: Built-in tools (e.g., `ingest_docs`) utilize `context.tenantId` for storage operations.
- [!] **Registry**: `registry.ts` uses a global `Map`.
    - *Risk*: Low (definitions are static), but strict care is needed.
    - *Mitigation*: Ensure `registerTool` is never called with tenant-specific logic at runtime.

### 4. AI Gateway
- [x] **Routing**: `runGatewayChat` takes `tenantId` and logs usage metrics tagged with it.
- [x] **Permissions**: Model allowlists are enforced per-tenant in `worker-api/index.ts`.

## Code Evidence

### Good Pattern (Storage)
```typescript
// packages/storage/src/kv.ts
export const tenantKey = (tenantId: string, key: string) => `${tenantId}:${key}`;
```

### Good Pattern (Vectorize)
```typescript
// packages/storage/src/vectorize.ts
const adapter = new TenantVectorizeAdapter(index);
await adapter.upsert(tenantId, vectors);
```

## Vulnerabilities / Warnings
1.  **Global Tool Registry**: The `packages/tools/src/registry.ts` is a singleton. If a developer accidentally registers a tenant-specific tool at runtime, it would leak to other tenants.
    - *Recommendation*: Move registry to `Env` or `Context` if dynamic tools are needed.

## Conclusion
The architecture provides robust isolation. The reliance on explicit parameters over implicit context is a strong positive signal.
