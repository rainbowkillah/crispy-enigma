# Test Suite

Unit and integration tests for the monorepo.

## Running Tests

\`\`\`bash
npm test
nx run worker-api:test
nx affected:test
\`\`\`

## Test Organization

- `*.spec.ts` files - Unit and integration tests
- Tests use vitest framework
- Mock Cloudflare bindings with testing utilities

See [docs/guides/testing.md](../docs/guides/testing.md) for full strategy.
