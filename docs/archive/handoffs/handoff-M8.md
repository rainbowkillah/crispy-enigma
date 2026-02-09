# Handoff: M8 Deploy & Operations (Codex)

**Date:** 2026-02-08  
**Owner:** Codex  
**Scope:** M8 — Deploy & Operations (Issues #42–#49 + #52)

---

## ✅ Completion Summary

M8 is complete with staging **and production** validated for both production tenants.

**Key Deliverables Completed**
- Config validation (`scripts/validate-config.mjs`) with optional remote Vectorize checks.
- Environment selection checks in dev + deploy scripts.
- Single-tenant deploy (`scripts/deploy-tenant.mjs`).
- Multi-tenant deploy (`scripts/deploy-all.mjs`) with per-tenant auth.
- Drift detection (`scripts/detect-drift.mjs`).
- Runbooks and multi-account auth doc.
- CI gate workflow verified locally (lint/typecheck/test + integration smoke).

**Staging URLs (verified):**
- `https://bluey-ai-worker-staging.mrrainbowsmoke.workers.dev`
- `https://azure-ai-worker-staging.rainbowsmokeofficial.workers.dev`

**Production URLs (verified):**
- `https://bluey-ai-worker-production.mrrainbowsmoke.workers.dev`
- `https://azure-ai-worker-production.rainbowsmokeofficial.workers.dev`

---

## What Was Done

### Deployment Automation
- `npm run deploy -- --tenant=<name> --env=<env>`
- `npm run deploy:all -- --env=staging`
- Per-tenant API token selection:
  - `CLOUDFLARE_API_TOKEN_<TENANT>` (preferred)
  - `CLOUDFLARE_API_TOKEN` (fallback)

### Drift Detection
- `npm run drift -- --tenant=<name> --env=<env>`
- Writes drift reports to `drift/` (gitignored).

### Validation
- `npm run validate -- --tenant=<name|all> [--env=<env>] [--remote]`
- `--remote` checks Vectorize indexes via API.

### Docs Added
- Multi-account auth: `docs/deployment/multi-account-auth.md`
- Rollback runbook: `docs/runbooks/rollback-deployment.md`
- Incident runbook: `docs/runbooks/incident-response.md`

---

## Operational Notes

- **Vectorize index requirement:** Each tenant account must have `ai-worker-stg` created for staging (completed for both tenants).
- **Smoke checks:** `npm run smoke:dev -- --tenant=<tenant> --host=<worker-host>` now defaults to HTTPS for non-local hosts.

---

## Outstanding / Next Steps

- **CI in GitHub:** Workflow rerun triggered (manual `workflow_dispatch` not available); confirm passing in Actions UI.
- **Optional:** Add production runbook and release tagging if needed.

---

## Reference Files

- `scripts/validate-config.mjs`
- `scripts/deploy-tenant.mjs`
- `scripts/deploy-all.mjs`
- `scripts/detect-drift.mjs`
- `scripts/smoke-dev.mjs`
- `docs/milestones/M8/STATUS.md`
- `docs/deployment/multi-account-auth.md`
- `docs/runbooks/rollback-deployment.md`
- `docs/runbooks/incident-response.md`
