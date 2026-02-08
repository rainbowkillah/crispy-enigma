# Error Handling Patterns

**Date**: February 8, 2026
**Status**: 🟡 Consistent but Ad-hoc

## Analysis

### 1. Error Response Format
- **Pattern**: Consistent use of `fail()` helper in `apps/worker-api`.
- **Format**:
    ```json
    {
      "ok": false,
      "error": {
        "code": "invalid_request",
        "message": "...",
        "traceId": "..."
      }
    }
    ```
- **Verdict**: ✅ Excellent user-facing consistency.

### 2. Internal Error Classes
- **Location**: `packages/tools/src/errors.ts`
- **Classes**: `ToolExecutionError` with `ToolErrorCode`.
- **Verdict**: ✅ Good use of custom error types for domain logic.

### 3. Exception Swallowing
- **Location**: `packages/ai/src/gateway.ts` (`runGatewayChat`)
- **Pattern**:
    ```typescript
    try {
      // attempt model
    } catch (error) {
      lastError = error;
      // continue to next model
    }
    ```
- **Verdict**: ⚠️ Acceptable for fallback logic, but `throw lastError` at the end loses the context of *previous* errors (only throws the last one).
- **Recommendation**: Aggregate errors (e.g., `AggregateError`) if multiple models fail, to help debugging.

### 4. Logging
- **Pattern**: `logger.error(event, error, metadata)`
- **Verdict**: ✅ Good. Structured logging captures stack traces and context (`tenantId`, `traceId`).

### 5. HTTP Status Codes
- **Pattern**:
    - 400: Validation/Input errors
    - 403: Permissions/Allowlist
    - 429: Rate limits
    - 500/502: Internal/Upstream errors
- **Verdict**: ✅ Correct semantic usage.

## Recommendations
1.  **Aggregate Failures**: In AI Gateway, if fallback fails, log/return info about *both* failures, not just the last one.
2.  **Global Error Boundary**: Ensure `worker.fetch` has a top-level `try/catch` to catch unhandled synchronous errors (though `fail()` covers most paths).
