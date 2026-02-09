# Refactoring Opportunities

This document outlines areas for code improvement, focusing on maintainability, readability, and performance.

## High Priority

### 1. Monolithic Handler in `apps/worker-api/src/index.ts`
The `fetch` handler in `apps/worker-api/src/index.ts` is over 800 lines long and contains all routing, business logic, validation, and error handling.
- **Problem**: Difficult to test, maintain, and extend. Mixing routing with business logic makes it hard to see the high-level flow.
- **Recommendation**:
    - Extract route handlers into separate controller files (e.g., `controllers/chat.ts`, `controllers/rag.ts`, `controllers/tools.ts`).
    - Use a lightweight router (like `itty-router` or Hono) or a custom router class to manage routes.
    - Move validation logic (Zod schemas) to a shared `schema` package or dedicated files.

### 2. Missing `ctx.waitUntil` for Background Tasks
Throughout `apps/worker-api/src/index.ts`, background tasks are fired without being awaited or passed to `context.waitUntil`.
- **Location**: `apps/worker-api/src/index.ts`
- **Examples**:
    - `void recordToolAudit(...)`
    - `void recordToolMetrics(...)`
    - `void recordCost(...)`
    - `void setCachedSearch(...)`
    - `void recordSearchMetrics(...)`
- **Problem**: In Cloudflare Workers, promises not awaited before the response is returned are cancelled. This leads to data loss in logs, metrics, and caches.
- **Recommendation**: Ensure the `fetch` handler signature includes `ctx: ExecutionContext` and wrap all background promises in `ctx.waitUntil(promise)`.

## Medium Priority

### 1. Duplicate Error Handling
Error handling logic is repeated across different route handlers.
- **Location**: `apps/worker-api/src/index.ts`
- **Problem**: Inconsistent error responses if one block is changed but others are not.
- **Recommendation**: Implement a central error handling middleware or utility function that takes an error and returns a standardized JSON response.

### 2. Implicit `any` in `extractJsonArray`
The function `extractJsonArray` uses `JSON.parse(candidate) as unknown` and then checks `Array.isArray`.
- **Location**: `apps/worker-api/src/index.ts`
- **Problem**: While functional, it could be more robust using a validation library like Zod to ensure the array contains strings specifically, rather than just `typeof item === 'string'`.
- **Recommendation**: Use `z.array(z.string()).safeParse()` for stricter validation.

## Low Priority

### 1. Magic Strings for Error Codes
Error codes like `'invalid_request'`, `'ai_error'`, `'method_not_allowed'` are hardcoded strings.
- **Location**: `apps/worker-api/src/index.ts` and `packages/core/src/http/response.ts`
- **Problem**: Typos in error codes can lead to client-side handling issues.
- **Recommendation**: Define an enum or constant object for all API error codes (e.g., `ApiErrorCodes.INVALID_REQUEST`).

### 2. Hardcoded Routes
Route paths are hardcoded in `if` statements.
- **Location**: `apps/worker-api/src/index.ts`
- **Problem**: Hard to get a complete view of the API surface.
- **Recommendation**: Define routes in a constant object or configuration file.