# Wrangler Version + Module Format

## Version Pin
- Wrangler CLI is pinned in `package.json` as `wrangler@4.20.0`.
- Install via `pnpm install` (or `npm install`) to use the local CLI.

## Module Format
- This repo uses **ESM** (modules) for Workers.
- `package.json` sets `"type": "module"`.
- Worker entrypoints export `default` module handlers (no Service Worker format).
- Tenant configs use `wrangler.jsonc` (not `wrangler.toml`).
