# PR Summary

## Summary
Align AI Gateway slugs with tenant configs to unblock Issue #25 staging validation, document the root cause, and improve AI Gateway error logging for faster diagnosis.

## Changes
- Updated tenant gateway IDs to match Cloudflare AI Gateway slugs (`ai-gate`, `ai_gateway`).
- Added structured AI Gateway error logging with `tenantId` and `traceId` for stream and non-stream failures.
- Updated AI Gateway example docs to explicitly match tenant configs.
- Documented the root cause and fix in the M2 handoff, project status, and changelog.
- Updated AI Gateway test expectation for the new gateway slug.
- Added `archive/` to `.gitignore`.

## Testing
- `npm test`
- `npm run lint`
- `npm run typecheck`

## Notes
- Staging validation still requires running against a real Cloudflare AI Gateway to confirm logs and streaming behavior.
