# Error Handling Patterns

This report analyzes how errors are captured, reported, and presented to the client.

## Pattern Overview

### 1. The `fail` Helper
- **Usage**: Widespread.
- **Signature**: `fail(code: string, message: string, status?: number, traceId?: string)`
- **Output**: JSON `{ ok: false, error: { code, message }, traceId }`.
- **Verdict**: **Good**. Provides a consistent error shape for clients.

### 2. Try/Catch Blocks
- **Usage**: Used around external API calls (AI Gateway, Storage, Tools).
- **Behavior**: Catches exceptions, logs them with `logger.error`, and returns a `fail` response (usually 500 or 502).
- **Verdict**: **Good**. Prevents unhandled exceptions from crashing the worker (though the worker runtime handles that, a structured error is better).

### 3. Domain-Specific Errors
- **Classes**: `ToolExecutionError` in `packages/tools`.
- **Handling**: Explicitly caught and mapped to HTTP status codes (404, 403, 400).
- **Verdict**: **Excellent**. Allows for semantic error handling beyond just "something broke".

## Weaknesses

### 1. Missing `ctx.waitUntil`
- **Impact on Errors**: If an error occurs in a background task (like logging or metrics), it might not be reported because the promise is floating and the worker might exit.
- **Recommendation**: As noted in other reports, use `ctx.waitUntil`.

### 2. Magic Strings
- **Issue**: Error codes are string literals.
- **Recommendation**: Use an enum `ApiErrorCode` to prevent typos and enable easy documentation generation.

### 3. Silent Failures
- **Example**: `safeWrite` in the streaming handler catches errors and ignores them (`// Client likely disconnected; ignore.`).
- **Verdict**: **Acceptable** for streaming disconnection, but ensures that *actual* logic errors aren't swallowed there.

## Logging
- **Logger**: `logger.error` is used with context (tenantId, traceId).
- **Verdict**: **Good**. Essential for debugging in production.