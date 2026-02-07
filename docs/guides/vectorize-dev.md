# Vectorize Local Emulation & Staging Strategy

## Summary

Vectorize is not supported in Wrangler **local** mode. Use remote bindings in dev or staging for any tests that require real Vectorize behavior.

## Local Dev Limitations

- `wrangler dev --local` reports Vectorize as **not supported**.
- Vectorize queries and upserts will fail or be stubbed locally.
- Use unit tests with faked Vectorize bindings to validate logic deterministically.

## Recommended Strategy

1. **Unit tests (local):**  
   Use fake Vectorize implementations to validate request shapes, metadata, and tenant scoping.

2. **Remote dev bindings:**  
   Use `remote: true` in `wrangler.jsonc` for Vectorize to connect to real indexes while keeping local code iteration.

3. **Staging validation:**  
   Validate end-to-end ingestion + retrieval through the staging worker and confirm results in Vectorize.

## Known Good Setup

Example dev config (per-tenant `wrangler.jsonc`):

```json
{
  "vectorize": [
    {
      "binding": "VECTORIZE",
      "index_name": "ai-worker-dev",
      "remote": true
    }
  ]
}
```

## Validation Checklist

- Upserts include `tenantId`, `docId`, `chunkId` metadata.
- Vectorize query uses the tenant namespace.
- Retrieval returns only tenant-scoped vectors.
