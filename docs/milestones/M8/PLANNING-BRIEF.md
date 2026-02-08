# M8 Planning Brief for Codex

**Date:** 2026-02-08  
**Status:** Ready for Planning  
**Prerequisites:** M6 Complete ✅ | M7 Complete ✅  
**Duration Estimate:** 16-24 hours  

---

## Executive Summary

M8 focuses on **deployment automation and operational readiness**. The goal is to move from manual `wrangler deploy` commands to repeatable, validated, multi-tenant deployment workflows with drift detection and runbooks.

**Core Challenge:** We have 2 production tenants (`mrrainbowsmoke`, `rainbowsmokeofficial`) each with their own Cloudflare account, and need to deploy the worker-api consistently across dev/staging/prod environments.

---

## Current State Assessment

### ✅ What's Working
- **Tenant Configs:** Both production tenants have `tenant.config.json` with valid schemas
- **Wrangler Configs:** Each tenant has `tenants/<name>/wrangler.jsonc` 
- **Local Dev:** `npm run dev -- --tenant=<name>` works for all tenants
- **Testing:** 198 tests passing, TypeScript compiles cleanly
- **Manual Deploy:** `wrangler deploy` works when run manually in tenant directory
- **Scope Update:** Dev/pre-staging tenants (`alpha`, `example`) removed from repo; production tenants only

### ⚠️ Gaps & Blockers
1. **No Deployment Scripts:** Deployment is manual and error-prone
2. **No Config Validation:** Invalid configs can be deployed accidentally
3. **No Drift Detection:** Can't verify deployed state matches expected config
4. **No Multi-Account Strategy:** Managing credentials for 4 accounts is ad-hoc
5. **No Rollback Procedure:** No documented way to revert bad deployments
6. **M7 Complete:** Logging/metrics/CI gates are implemented; verify CI gates (#52) before automation

### 📊 Repository Structure
```
crispy-enigma/
├── apps/worker-api/              # Main worker to deploy
├── tenants/
│   ├── mrrainbowsmoke/
│   │   ├── tenant.config.json    # Runtime config
│   │   └── wrangler.jsonc        # Deploy config
│   └── rainbowsmokeofficial/
├── scripts/
│   └── dev.mjs                   # Local dev script (template for deploy)
└── packages/                     # Shared libraries
```

---

## M8 Issues Breakdown

### Phase 1: Foundation (#46, #47)
**Goal:** Validate configs and select environments before deployment.

#### Issue #46: Implement config validation (fail fast)
- **Deliverable:** `scripts/validate-config.mjs`
- **Validates:**
  - `tenant.config.json` matches Zod schema
  - `wrangler.jsonc` has required bindings (KV, DO, Vectorize, AI)
  - Secrets are defined (not values, just names)
  - Account IDs match between files
- **Exit Code:** Non-zero on validation failure
- **Usage:** `npm run validate -- --tenant=<name>`

#### Issue #47: Add environment selection (dev/stage/prod)
- **Deliverable:** Environment naming convention + validation
- **Environments:**
  - `dev` - Local wrangler dev with Miniflare
  - `staging` - Preview deployment (`<worker>.<tenant>.workers.dev`)
  - `production` - Workers.dev deployment (same URL pattern as staging)
- **Implementation:**
  - Add `--env` flag support to scripts
  - Map to wrangler's `--env` parameter
  - Validate environment exists in `wrangler.jsonc` (e.g., `env.staging`)

### Phase 2: Deployment Scripts (#48, #49)
**Goal:** Automate tenant deployments with validation and logging.

#### Issue #49: Create deployment script: deploy one tenant
- **Deliverable:** `scripts/deploy-tenant.mjs`
- **Features:**
  - Accepts `--tenant=<name>` and `--env=<dev|staging|prod>`
  - Runs config validation first (fail fast)
  - Executes `wrangler deploy` with correct working directory
  - Captures deployment output (URL, version, timestamp)
  - Logs deployment result to `deployments/<tenant>-<env>-<timestamp>.json`
- **Usage:** `npm run deploy -- --tenant=mrrainbowsmoke --env=staging`
- **Error Handling:**
  - Pre-deployment: Config validation failure
  - During deployment: Wrangler errors (bindings missing, quota exceeded)
  - Post-deployment: Health check failure

#### Issue #48: Create deployment script: deploy all tenants
- **Deliverable:** `scripts/deploy-all.mjs`
- **Features:**
  - Accepts `--env=<staging|prod>` (not dev, dev is local-only)
  - Iterates over all tenants in `tenants/` directory
  - Calls `deploy-tenant.mjs` for each tenant
  - Collects results (success/failure per tenant)
  - Generates summary report
  - Exits with non-zero code if any tenant fails
- **Usage:** `npm run deploy:all -- --env=staging`
- **Options:**
  - `--parallel` - Deploy tenants in parallel (risky, use for independent tenants)
  - `--continue-on-error` - Don't stop on first failure
  - `--only=<tenant1,tenant2>` - Deploy specific tenants only

### Phase 3: Drift Detection (#45)
**Goal:** Verify deployed state matches expected configuration.

#### Issue #45: Implement drift detection (expected vs deployed)
- **Deliverable:** `scripts/detect-drift.mjs`
- **Checks:**
  1. **Worker Version:** Compare deployed script hash vs local build
  2. **Environment Variables:** Verify all expected vars are set (not values, just presence)
  3. **Bindings:** Confirm KV, DO, Vectorize, AI bindings match `wrangler.jsonc`
  4. **Routes/Triggers:** Verify cron triggers and route patterns
  5. **Compatibility Date:** Check wrangler compatibility_date matches
- **Data Source:** Cloudflare API (`/accounts/{id}/workers/scripts/{name}`)
- **Output:** JSON diff with `added`, `removed`, `changed` fields
- **Usage:** `npm run drift -- --tenant=<name> --env=staging`
- **Integration:** Can be run post-deployment as validation step

### Phase 4: Multi-Account Strategy (#44)
**Goal:** Manage credentials for multiple Cloudflare accounts securely.

#### Issue #44: Define multi-account credential strategy
- **Deliverable:** `docs/deployment/multi-account-auth.md`
- **Options:**
  1. **API Tokens (Recommended):**
     - Per-tenant API token with minimal permissions (Workers:Edit, Account:Read)
     - Store in `.env.deploy` (git-ignored) as `CLOUDFLARE_API_TOKEN_<TENANT>`
     - Script reads token based on `--tenant` flag
  2. **Service Tokens:**
     - Cloudflare Access service token per tenant
     - More secure, better audit trail
     - Requires Access subscription
  3. **Wrangler Login + Profiles:**
     - `wrangler login` creates session
     - Switch profiles with environment variable
     - Not ideal for CI/CD
- **Recommendation:** Use API tokens for M8. Tokens must have:
  - `Account > Workers Scripts > Edit`
  - `Account > Account Settings > Read` (for account ID validation)
- **Security:**
  - Never commit tokens to git
  - Tokens stored in `.env.deploy` (added to .gitignore)
  - CI/CD uses GitHub Secrets or Cloudflare API tokens

### Phase 5: Runbooks (#42, #43)
**Goal:** Document procedures for common operational tasks.

#### Issue #43: Create deploy rollback runbook
- **Deliverable:** `docs/runbooks/rollback-deployment.md`
- **Procedure:**
  1. **Identify Bad Deployment:** Logs, metrics, alerts point to version
  2. **Find Previous Version:** Check `deployments/<tenant>-<env>-<timestamp>.json`
  3. **Rollback Options:**
     - **Option A:** Re-deploy from git tag (preferred)
     - **Option B:** Use wrangler rollback command (if available)
     - **Option C:** Use Cloudflare dashboard's version history
  4. **Verify Rollback:** Run smoke tests, check `/health` endpoint
  5. **Post-Rollback:** Update incident log, investigate root cause
- **Prerequisites:**
  - Deployment logs with version/timestamp
  - Git tags for each production deployment
  - Smoke test suite (from M7)

#### Issue #42: Create incident response runbook
- **Deliverable:** `docs/runbooks/incident-response.md`
- **Covers:**
  - **Detection:** How incidents are identified (alerts, user reports)
  - **Triage:** Severity classification (P0-P3)
  - **Communication:** Who to notify, status page updates
  - **Investigation:** Logs, metrics, tracing to find root cause
  - **Mitigation:** Rollback, feature flag toggle, rate limit adjustment
  - **Post-Mortem:** Template for incident writeup

### Phase 6: CI Gates (#52 from M7)
**Goal:** Automate quality checks to prevent bad deployments.

#### Issue #52: Set up CI gates (lint, typecheck, unit, integration)
- **Deliverable:** `.github/workflows/ci.yml`
- **Stages:**
  1. **Lint:** `npm run lint` must pass (exit 0)
  2. **TypeCheck:** `npm run typecheck` must pass
  3. **Unit Tests:** `npm test` must pass (198+ tests)
  4. **Config Validation:** `npm run validate -- --tenant=all`
  5. **Build:** `npm run build` (optional, for pre-deployment checks)
- **Triggers:**
  - On every PR to `main` or `develop`
  - On push to protected branches
  - Manual trigger for testing
- **Branch Protection:** Require CI to pass before merge
- **Note:** This is an M7 issue but CRITICAL for M8. Deploy automation is unsafe without verified CI gates.

---

## Dependencies & Prerequisites

### Must Complete Before M8 Start
1. ✅ M6 Complete (TTS adapter boundary)
2. ✅ M7 Tier 1 (#58-#61) - Logging, metrics, tracing foundation
3. ⚠️ M7 #52 - CI gates (verify before deployment automation)

### Nice to Have (Can Defer)
- M7 Tier 2-4 (load tests, retrieval quality, dashboards)
- M6 #64 (TTS provider implementation - stub is sufficient)

### External Dependencies
- Cloudflare API tokens for both production tenant accounts
- Access to Cloudflare dashboard for each tenant
- GitHub repository permissions to set up Actions (for #52)

---

## Acceptance Criteria for M8

### Functional Requirements
- [ ] **Single Tenant Deploy:** `npm run deploy -- --tenant=X --env=staging` works for both tenants
- [ ] **Multi-Tenant Deploy:** `npm run deploy:all -- --env=staging` deploys both tenants successfully
- [ ] **Config Validation:** Invalid configs are rejected before deployment attempt
- [ ] **Drift Detection:** Can identify differences between deployed and expected state
- [ ] **Rollback Runbook:** Documented procedure tested with staging rollback
- [ ] **Incident Runbook:** Template covers detection, triage, mitigation, post-mortem

### Non-Functional Requirements
- [ ] **Idempotent:** Running deploy script twice produces same result (no double-deploys)
- [ ] **Atomic:** Deployment either succeeds completely or fails cleanly (no partial state)
- [ ] **Observable:** Deployment logs include timestamp, tenant, environment, version, status
- [ ] **Auditable:** Deployment history stored in `deployments/` directory

### Quality Gates
- [ ] **CI Passing:** All tests, lint, typecheck pass in CI before deployment
- [ ] **Zero Manual Steps:** No manual copy-paste or dashboard clicks for deployment
- [ ] **Secrets Secure:** No tokens/secrets in git, all use environment variables

---

## Technical Decisions Needed

### 1. Wrangler Invocation Strategy
**Question:** How should scripts invoke `wrangler deploy`?

**Options:**
- **A) Shell Execution:** `child_process.exec('wrangler deploy', { cwd: tenantDir })`
  - Pros: Simple, uses installed wrangler
  - Cons: Shell escaping, harder to capture structured output
- **B) Wrangler API (if available):** Import wrangler as library
  - Pros: Type-safe, no shell, structured output
  - Cons: May not be exposed, experimental
- **C) Cloudflare Workers API:** Direct API calls, skip wrangler
  - Pros: Full control, no CLI dependency
  - Cons: Complex (need to bundle script, handle bindings manually)

**Recommendation:** Option A (shell exec) for M8, revisit B/C in M9 if needed.

### 2. Deployment Artifact Storage
**Question:** Where should deployment logs/metadata be stored?

**Options:**
- **A) Local Filesystem:** `deployments/<tenant>-<env>-<timestamp>.json`
  - Pros: Simple, works offline, git-committable
  - Cons: Not accessible in CI without artifact upload
- **B) KV Namespace:** Store in Cloudflare KV
  - Pros: Centralized, accessible from workers
  - Cons: Requires KV binding, harder to query
- **C) External Service:** Datadog, S3, etc.
  - Pros: Production-grade, queryable
  - Cons: External dependency, cost

**Recommendation:** Option A for M8, add B in M9 for prod observability.

### 3. Parallel vs Sequential Deployment
**Question:** Should `deploy-all` deploy tenants in parallel?

**Options:**
- **A) Sequential:** One tenant at a time, stop on first failure
  - Pros: Easier to debug, less Cloudflare API load
  - Cons: Slower (2 tenants × 30s = ~1 minute)
- **B) Parallel:** All tenants at once
  - Pros: Faster (30 seconds total)
  - Cons: Harder to debug, may hit rate limits, complex error handling
- **C) Configurable:** Default sequential, opt-in parallel with `--parallel`

**Recommendation:** Option C - default to safe sequential, allow parallel for power users.

### 4. Health Check Strategy
**Question:** How to verify deployment succeeded?

**Options:**
- **A) HTTP Health Check:** Call `GET /<worker-url>/health` after deploy
  - Pros: Direct verification, works for staging
  - Cons: Doesn't work for workers without HTTP triggers (cron-only)
- **B) Wrangler Tail:** Connect to wrangler tail, trigger synthetic request
  - Pros: Works for all workers
  - Cons: Complex setup, requires secondary tool
- **C) Cloudflare API:** Query worker status via API
  - Pros: Authoritative, no HTTP request needed
  - Cons: Doesn't test actual functionality, just presence

**Recommendation:** Option A for M8 (all our workers have HTTP endpoints).

---

## Risk Assessment

### High Risk
1. **Unverified CI Gates (#52):** Deploying without CI gates could push broken code
   - **Mitigation:** Make #52 a hard blocker for M8
2. **Multi-Account Token Management:** Tokens leaked in git or CI logs
   - **Mitigation:** Use `.env.deploy` (git-ignored), audit CI logs carefully
3. **Deployment Failure Recovery:** Broken deployment with no rollback
   - **Mitigation:** Test rollback procedure in staging first (issue #43)

### Medium Risk
1. **Wrangler Version Drift:** Different wrangler versions on dev vs CI
   - **Mitigation:** Pin wrangler version in `package.json` (already done: 4.63.0)
2. **Binding Quota Limits:** Hitting Cloudflare plan limits during deployment
   - **Mitigation:** Validate quotas pre-deployment (Vectorize indexes, KV namespaces)
3. **Concurrent Deployments:** Two devs deploying same tenant simultaneously
   - **Mitigation:** Document best practices, consider deployment locks (M9)

### Low Risk
1. **Drift Detection False Positives:** Detecting drift that doesn't matter
   - **Mitigation:** Tune detection thresholds, allow "acceptable" drift
2. **Deployment Script Bugs:** Script errors causing failed deployments
   - **Mitigation:** Extensive testing in dev/staging before using in prod

---

## Implementation Order Recommendation

### Sprint 1: Config Validation & Single Tenant Deploy (4-6 hours)
1. Issue #46 - Config validation script
2. Issue #47 - Environment selection
3. Issue #49 - Single tenant deploy script
4. **Checkpoint:** Successfully deploy `mrrainbowsmoke` tenant to staging

### Sprint 2: Multi-Tenant & Drift Detection (4-6 hours)
1. Issue #48 - Deploy all tenants script
2. Issue #45 - Drift detection
3. **Checkpoint:** Deploy both tenants to staging, verify no drift

### Sprint 3: Credentials & Runbooks (4-6 hours)
1. Issue #44 - Multi-account credential strategy
2. Issue #43 - Rollback runbook
3. Issue #42 - Incident response runbook
4. **Checkpoint:** Test rollback procedure in staging

### Sprint 4: CI Gates (4-6 hours)
1. Issue #52 - GitHub Actions CI workflow
2. **Checkpoint:** PR requires CI to pass before merge

**Total Estimated Time:** 16-24 hours across 4 sprints

---

## Success Metrics

### Deployment Automation
- **Deployment Time:** < 2 minutes for single tenant, < 5 minutes for all tenants
- **Success Rate:** > 95% deployment success rate in staging
- **Manual Steps:** Zero manual steps required for deployment

### Operational Readiness
- **Runbook Completeness:** Rollback and incident response tested at least once
- **Config Drift:** Zero unexplained drift detected post-deployment
- **Security:** Zero secrets committed to git, zero token leaks in logs

### Developer Experience
- **Ease of Use:** New developer can deploy to staging with < 5 minutes of instruction
- **Documentation:** All deployment procedures documented in `docs/deployment/`
- **Error Messages:** Clear, actionable error messages for common deployment failures

---

## Post-M8 Considerations (M9 and beyond)

### Features to Defer
1. **Blue/Green Deployments:** Deploy to preview, then promote to prod
2. **Canary Releases:** Gradually roll out to percentage of traffic
3. **Deployment Locks:** Prevent concurrent deployments
4. **Slack/Discord Notifications:** Alert on deployment success/failure
5. **Rollback Automation:** Automatic rollback on health check failure
6. **Multi-Region Deployment:** Deploy to multiple Cloudflare regions

### Technical Debt to Address
1. **Wrangler API Usage:** Migrate from shell exec to wrangler library (if available)
2. **Deployment Metadata Storage:** Migrate from filesystem to KV or external service
3. **Secret Management:** Evaluate Cloudflare Workers Secrets API or Vault integration
4. **Deployment Analytics:** Track deployment frequency, success rate, time-to-deploy

---

## Questions for Planning Session

1. **M7 Blocker Resolution:** Confirm CI gates (#52) are passing before starting M8?
2. **CI Priority:** Is #52 (CI gates) mandatory before deployment automation?
3. **Token Acquisition:** Who owns getting API tokens for both production tenant accounts?
4. **Production Scope:** Is M8 scoped to staging only, or also production deployments?
5. **Timeline:** Is 16-24 hours realistic for the team's current velocity?
6. **External Dependencies:** Are there any org-level blockers (permissions, approvals)?

---

## Next Steps for Codex

1. **Review This Brief:** Validate assumptions, identify gaps
2. **Create M8 Plan:** Generate detailed implementation plan with tasks
3. **Task Breakdown:** Break each issue (#42-#49, #52) into subtasks
4. **Prompt Generation:** Create execution prompts for each task
5. **Risk Mitigation:** Propose solutions for high-risk items
6. **Timeline:** Estimate completion date based on team capacity

**Ready for M8 Planning? Let's build deployment automation! 🚀**
