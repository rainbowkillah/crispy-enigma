# Development Scripts

Scripts organized by purpose for easy discovery and maintenance.

## deployment/ - Production Deployment

- `deploy-all.mjs` - Deploy all tenants to all environments
- `deploy-tenant.mjs` - Deploy single tenant

## development/ - Local Development

- `dev.mjs` - Start development server
- `chat-dev.mjs` - Interactive chat CLI
- `smoke-dev.mjs` - Smoke test suite

## validation/ - Configuration & Diagnostics

- `validate-config.mjs` - Validate tenant configurations
- `detect-drift.mjs` - Check for config drift

## testing/ - Performance & Load

- `load-test.ts` - Load testing suite

## setup/ - One-Time Initialization

- `generate-tenant-index.mjs` - Generate tenant registry

## lib/ - Shared Utilities

Reusable code imported by above scripts.

---

All scripts use ES modules (`.mjs` format).
