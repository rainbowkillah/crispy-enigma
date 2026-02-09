# NX Generator Input Map

This document maps existing manual workflows to proposed Nx generators and executors.

## Generators

| Current Workflow | Proposed Nx Generator | Inputs / Options | Description |
| :--- | :--- | :--- | :--- |
| **Add Tenant**<br>1. Create `tenants/<name>/`<br>2. Copy `tenant.config.json`<br>3. Copy `wrangler.jsonc`<br>4. Edit files | `nx g @crispy/nx-cloudflare:tenant` | `--name=<tenant-name>`<br>`--accountId=<id>`<br>`--kv=...` | Scaffolds a new tenant directory with validated config files. |
| **Add Binding**<br>1. Edit `wrangler.jsonc`<br>2. Update `packages/core/src/env.ts` | `nx g @crispy/nx-cloudflare:binding` | `--tenant=<name>`<br>`--type=<kv\|d1\|do>`<br>`--name=<BINDING_NAME>` | Adds a binding to `wrangler.jsonc` and updates types if possible. |
| **New Package**<br>1. Create `packages/<name>`<br>2. Add `tsconfig.json`, `package.json` | `nx g @crispy/nx-cloudflare:lib` | `--name=<lib-name>`<br>`--directory=packages` | Creates a new shared library in `packages/` with standard config. |

## Executors (Targets)

| Current Workflow | Proposed Nx Target | Options | Description |
| :--- | :--- | :--- | :--- |
| **Validate Config**<br>`npm run validate -- --tenant=<name>` | `nx validate <tenant>` | `--env=<env>`<br>`--remote` | Validates `tenant.config.json` and `wrangler.jsonc` against schemas and binding rules. |
| **Deploy Tenant**<br>`npm run deploy -- --tenant=<name> --env=<env>` | `nx deploy <tenant>` | `--env=<env>`<br>`--dry-run` | Deploys a specific tenant to Cloudflare. |
| **Deploy All**<br>`npm run deploy:all -- --env=<env>` | `nx run-many -t deploy` | `--env=<env>`<br>`--parallel` | Deploys all tenants (or filtered set) in parallel. |
| **Generate Tenant Index**<br>`node scripts/generate-tenant-index.mjs` | `nx generate-index core` | N/A | Generates `tenants/index.ts` from available tenant configs. |

## Migration Steps

1.  **Init Nx**: Run `npx nx init` (already done mostly).
2.  **Plugin Install**: Install `@crispy/nx-cloudflare` (to be created).
3.  **Project Discovery**: Update `nx.json` or `project.json` files to recognize tenants as projects.
4.  **Script Replacement**: Replace `scripts/*.mjs` with Nx executors in the plugin.
