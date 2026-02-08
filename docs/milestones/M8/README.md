# M8: Deploy & Operations

**Status:** 📋 Ready for Planning  
**Duration:** 16-24 hours  
**Issues:** #42-#49 + #52 (9 total)  
**Prerequisites:** M6 ✅ | M7 Tier 1 ⚠️  

---

## Quick Links

- **Detailed Planning Brief:** [PLANNING-BRIEF.md](./PLANNING-BRIEF.md) - Comprehensive M8 plan with technical decisions, risk assessment, and implementation order
- **M6-M7 Handoff:** [../../m6-m7-handoff.md](../../m6-m7-handoff.md) - Context on what was completed and what's pending
- **GitHub Issues:** [M8: Deploy Milestone](https://github.com/rainbowkillah/crispy-enigma/issues?q=is%3Aopen+milestone%3A%22M8%3A+Deploy%22)

---

## Goals

Transform manual `wrangler deploy` commands into:
- ✅ Automated single-tenant deployment
- ✅ Automated multi-tenant deployment  
- ✅ Config validation (fail fast)
- ✅ Drift detection (verify deployed state)
- ✅ Rollback procedures
- ✅ CI quality gates

---

## Issues at a Glance

| # | Title | Priority | Est. Hours |
|---|-------|----------|------------|
| #52 | Set up CI gates | 🔴 BLOCKER | 4-6 |
| #46 | Config validation | 🔴 HIGH | 2-3 |
| #47 | Environment selection | 🔴 HIGH | 1-2 |
| #49 | Deploy single tenant | 🟡 MEDIUM | 3-4 |
| #48 | Deploy all tenants | 🟡 MEDIUM | 2-3 |
| #45 | Drift detection | 🟡 MEDIUM | 3-4 |
| #44 | Multi-account credentials | 🟢 LOW | 2-3 |
| #43 | Rollback runbook | 🟢 LOW | 1-2 |
| #42 | Incident response runbook | 🟢 LOW | 1-2 |

**Total:** 19-29 hours (estimate includes buffer)

---

## Current State

### ✅ What Works
- 4 tenants configured: `mrrainbowsmoke`, `rainbowsmokeofficial`, `alpha`, `example`
- All have valid `tenant.config.json` and `wrangler.jsonc`
- Local dev works: `npm run dev -- --tenant=<name>`
- 198 tests passing, TypeScript compiles cleanly
- Manual `wrangler deploy` works per tenant

### ⚠️ What's Missing
- No automated deployment scripts
- No config validation before deploy
- No drift detection after deploy
- No multi-account credential management
- No rollback or incident procedures
- **BLOCKER:** CI gates (#52 from M7) not set up

---

## Critical Path

```mermaid
graph TD
    A[#52: CI Gates] --> B[#46: Config Validation]
    B --> C[#47: Environment Selection]
    C --> D[#49: Deploy Single Tenant]
    D --> E[#48: Deploy All Tenants]
    E --> F[#45: Drift Detection]
    
    D --> G[#44: Multi-Account Auth]
    E --> H[#43: Rollback Runbook]
    F --> I[#42: Incident Runbook]
    
    style A fill:#ff6b6b
    style B fill:#ff6b6b
    style C fill:#ff6b6b
    style D fill:#ffd93d
    style E fill:#ffd93d
    style F fill:#ffd93d
```

**Red:** Blockers (must complete first)  
**Yellow:** Core functionality  
**Green:** Documentation & runbooks  

---

## Acceptance Criteria

### Deployment Works
- [ ] `npm run deploy -- --tenant=X --env=staging` succeeds for all 4 tenants
- [ ] `npm run deploy:all -- --env=staging` deploys all tenants
- [ ] Invalid configs rejected before deployment attempt
- [ ] Deployment logs stored in `deployments/` directory

### Verification Works  
- [ ] `npm run drift -- --tenant=X --env=staging` detects config drift
- [ ] Health check verifies deployment success
- [ ] Zero secrets in git or CI logs

### Operations Ready
- [ ] Rollback procedure documented and tested
- [ ] Incident response runbook covers detection → resolution
- [ ] CI gates prevent merging broken code

---

## Key Decisions

1. **Shell Exec for Wrangler:** Use `child_process.exec('wrangler deploy')` (simplest for M8)
2. **Local File Storage:** Store deployment logs in `deployments/` directory
3. **Sequential by Default:** Deploy tenants one at a time (safer), opt-in parallel
4. **HTTP Health Checks:** Verify deployment by calling `GET /health`

See [PLANNING-BRIEF.md](./PLANNING-BRIEF.md) for detailed rationale.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Incomplete M7 CI gates | 🔴 HIGH | Make #52 hard blocker for M8 start |
| Token leaks in git/logs | 🔴 HIGH | Use `.env.deploy` (git-ignored), audit logs |
| No rollback procedure | 🟡 MEDIUM | Test rollback in staging before prod |
| Binding quota limits | 🟡 MEDIUM | Validate quotas pre-deployment |

---

## Getting Started

### For Codex (M8 Planning Agent)
1. Read [PLANNING-BRIEF.md](./PLANNING-BRIEF.md) for full context
2. Review [m6-m7-handoff.md](../../m6-m7-handoff.md) for M7 status
3. Generate detailed task breakdown for each issue
4. Create execution prompts for implementation
5. Propose order of execution (recommend: #52 → #46 → #47 → #49 → #48 → #45)

### For Developers
1. **Start Here:** Issue #52 (CI gates) - blocker for all other work
2. **Then:** Issues #46-#47 (validation + env selection)
3. **Next:** Issue #49 (single tenant deploy)
4. **Finally:** Issues #48, #45, #44, #43, #42

---

## Questions?

Refer to **Questions for Planning Session** section in [PLANNING-BRIEF.md](./PLANNING-BRIEF.md#questions-for-planning-session).

**Ready to automate deployments! 🚀**
