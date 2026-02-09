# Tenant Isolation Audit

This document verifies the security and isolation mechanisms for multi-tenancy in the application.

## 1. Request Resolution
- **Mechanism**: `resolveTenant` function in `packages/core/src/tenant/resolveTenant.ts`.
- **Method**: Checks `x-tenant-id` header, Hostname mapping, or API Key mapping.
- **Verification**: **PASS**. The resolution logic is explicit and prioritized correctly.

## 2. Storage Isolation

### KV Namespace
- **Mechanism**: `TenantKVAdapter` in `packages/storage/src/kv.ts`.
- **Implementation**: Prefixes all keys with `${tenantId}:`.
    - `get`: `tenantKey(tenantId, key)`
    - `put`: `tenantKey(tenantId, key)`
- **Verification**: **PASS**. Key prefixing is a standard and effective isolation strategy for KV.

### Durable Objects
- **Mechanism**: `getTenantDurableObject` in `packages/storage/src/do.ts`.
- **Implementation**: Generates ID from name `${tenantId}:${objectId}`.
    - `makeTenantObjectName(tenantId, objectId)`
- **Verification**: **PASS**. Using the tenant ID in the name passed to `idFromName` ensures that different tenants get different DO instances for the same logical object ID.

### Vectorize (Vector Database)
- **Mechanism**: `TenantVectorizeAdapter` in `packages/storage/src/vectorize.ts`.
- **Implementation**:
    - `query`: Passes `namespace: tenantId` in options.
    - `upsert`: Maps vectors to include `namespace: tenantId`.
- **Verification**: **PASS**. This relies on the `Vectorize` binding supporting namespaces, which is the correct way to isolate vectors.

### Search Cache
- **Mechanism**: `buildCacheKey` in `packages/storage/src/search-cache.ts`.
- **Implementation**: `${tenantId}:search:${hash}`.
- **Verification**: **PASS**.

## 3. Runtime Isolation
- **AI Gateway**: `runGatewayChat` and `runGatewayEmbeddings` take `tenantId` and `gatewayId` from the tenant config.
- **Verification**: **PASS**. Requests are routed to the specific gateway configured for the tenant.

## 4. Cross-Tenant Leakage Risks
- **Logging**: `createLogger` includes `tenantId`. **PASS**.
- **Metrics**: `createMetrics` includes `tenantId`. **PASS**.
- **Global State**: No shared global state was found that persists across requests (except for `tenantIndex` which is read-only configuration).

## Conclusion
The application implements a robust "Logical Isolation" strategy. Data is co-located but strictly logically separated by mandatory `tenantId` prefixes or namespaces in all storage and access layers.