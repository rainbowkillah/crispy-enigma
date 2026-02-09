# Implementation Checklist: Repo Cleanup Operations

**Ready to Execute: Phase 1-5**  
**Date Prepared**: 2026-02-08  
**Gemini Sub-Agent**: Running parallel analysis with --yolo flags  
**Gemini Output**: See GEMINI-REFACTORING-GUIDE.md for deliverables

---

## Phase 1: Build Artifacts & Cache Cleanup

### Status: ✅ READY TO EXECUTE

```bash
# Delete Wrangler dev cache (all tenants)
find tenants -name ".wrangler" -type d -exec rm -rf {} +

# Verify deletion
ls tenants/mrrainbowsmoke/ | grep -i wrangler  # Should be empty
```

### Files to Delete
- [ ] `tenants/mrrainbowsmoke/.wrangler/`
- [ ] `tenants/rainbowsmokeofficial/.wrangler/`

**Expected**: Recover ~80MB disk space

---

## Phase 2: Session & Agent Memory Consolidation

### Status: ✅ ALREADY COMPLETED
```bash
# ✓ Sessions backed up to:
# - archive/sessions-backup/copilot-session-*.tar.gz
# - archive/sessions-backup/claude-session-*.tar.gz
# - archive/sessions-backup/gemini-session-*.tar.gz
```

### Files to Delete
- [ ] Delete `.copilot-session/*.md` (keep directory)
- [ ] Delete `.claude/agent-memory/` (entire folder)

```bash
# Execute
rm -f .copilot-session/*.md
rm -rf .claude/agent-memory/

# Move agent output
mkdir -p archive/agent-outputs
mv .claude/agents/*.md archive/agent-outputs/
```

**Files Affected**:
```
.copilot-session/
  ├── 002-milestone-verification-prs.md    [DELETE]
  ├── codex-handoff.md                     [DELETE]
  └── milestone-pr-summary.md              [DELETE]

.claude/
  └── agent-memory/                        [DELETE - entire]

.claude/agents/
  ├── claude-spec.md                       [MOVE → archive/agent-outputs/]
  └── claude-review.md                     [MOVE → archive/agent-outputs/]
```

---

## Phase 3: Deployment Records Consolidation

### Status: ✅ READY TO EXECUTE

```bash
# Create dated archive structure
mkdir -p archive/deployment-history/2026-02-08

# Move all deployment JSON files
mv deployments/*.json archive/deployment-history/2026-02-08/

# Create manifest
cat > archive/deployment-history/2026-02-08/index.json << 'EOF'
{
  "date": "2026-02-08",
  "deployments": [
    {
      "timestamp": "15-49-41-002Z",
      "tenant": "all",
      "environment": "production",
      "file": "deploy-all-production-2026-02-08T15-49-41-002Z.json",
      "status": "success"
    },
    {
      "timestamp": "15-18-28-659Z",
      "tenant": "all",
      "environment": "staging",
      "file": "deploy-all-staging-2026-02-08T15-18-28-659Z.json",
      "status": "success"
    }
  ]
}
EOF

# Create deployment history README
cp docs/guides/getting-started.md archive/deployment-history/README.md
```

### Files to Move/Delete
```
deployments/
├── deploy-all-production-2026-02-08T15-49-41-002Z.json     [MOVE]
├── deploy-all-staging-2026-02-08T15-18-28-659Z.json        [MOVE]
├── deploy-all-staging-2026-02-08T15-20-21-125Z.json        [MOVE]
├── deploy-all-staging-2026-02-08T15-20-10-949Z.json        [MOVE]
├── mrrainbowsmoke-production-2026-02-08T15-49-35-101Z.json  [MOVE]
├── mrrainbowsmoke-staging-2026-02-08T15-19-56-681Z.json    [MOVE]
├── rainbowsmokeofficial-production-2026-02-08T15-50-35-596Z.json [MOVE]
├── rainbowsmokeofficial-staging-2026-02-08T15-11-15-211Z.json  [MOVE]
├── rainbowsmokeofficial-staging-2026-02-08T15-14-05-833Z.json  [MOVE]
└── rainbowsmokeofficial-staging-2026-02-08T15-20-10-949Z.json  [MOVE]
```

### After Move
```bash
# Create placeholder in deployments/
cat > deployments/README.md << 'EOF'
# Deployment Records

Historical deployment logs have been moved to `archive/deployment-history/`.

See `archive/deployment-history/YYYY-MM-DD/index.json` for past deployment manifests.

For the latest deployment status, check:
- GitHub Actions workflow logs
- Cloudflare Dashboard
EOF
```

---

## Phase 4: Archive Cleanup (Remove Stale Scripts)

### Status: ✅ READY TO EXECUTE

```bash
# Delete duplicate script
rm archive/m4-codex-prompt.sh

# Create scripts subdirectory
mkdir -p archive/scripts

# Move primary script
mv archive/M4-CODEX-PROMPTS.sh archive/scripts/M4-codex-generation.sh

# Move old session file
mkdir -p archive/sessions
mv archive/session-copilot02062026.md archive/sessions/2026-02-06-session.md

# Clean up empty date folder
rmdir archive/2026-02-07  # Only if empty
```

### Files to Delete/Move
```
archive/
├── m4-codex-prompt.sh                    [DELETE - duplicate]
├── M4-CODEX-PROMPTS.sh                   [MOVE → scripts/M4-codex-generation.sh]
├── session-copilot02062026.md            [MOVE → sessions/2026-02-06-session.md]
└── 2026-02-07/                           [REMOVE if empty]
```

**Verification**:
```bash
# Should exist
ls archive/scripts/M4-codex-generation.sh
ls archive/sessions/2026-02-06-session.md
ls archive/sessions-backup/

# Should NOT exist
test -f archive/m4-codex-prompt.sh && echo "ERROR: Not deleted" || echo "✓ Deleted"
```

---

## Phase 5: Documentation Structure Consolidation

### Status: ✅ READY TO EXECUTE

#### Step 1: Create New Directories
```bash
mkdir -p docs/integration/examples
mkdir -p docs/archive/benchmarks
mkdir -p docs/archive/handoffs
mkdir -p docs/archive/sessions
```

#### Step 2: Move Postman Files
```bash
# Postman collections to integration/
mv docs/postman-collection.json docs/integration/
mv docs/postman-env.staging.json docs/integration/

# Postman guide renamed and moved
mv docs/POSTMAN_GUIDE.md docs/integration/README.md

# Examples subdirectory
mv docs/examples/* docs/integration/examples/
rmdir docs/examples
```

#### Step 3: Archive Old Handoffs
```bash
# Move all milestone handoffs to archive
mv docs/handoff-M5.md docs/archive/handoffs/
mv docs/m5-handoff.md docs/archive/handoffs/
mv docs/m5-m6-handoff.md docs/archive/handoffs/
mv docs/m6-m7-handoff.md docs/archive/handoffs/
mv docs/handoff-M8.md docs/archive/handoffs/

# Move m4 results
mv docs/m4-results docs/archive/benchmarks/

# Move performance HTML
mv API-performance.html docs/archive/benchmarks/
```

#### Step 4: Update docs/archive Organization
```bash
# Move old milestone docs (if duplicated in docs/archive/milestones)
# Note: Keep docs/milestones/ as-is
mv docs/archive/milestones docs/archive/milestone-history

# If empty, can remove:
rmdir docs/archive/milestones  # Only if now empty
```

#### Step 5: Verify Structure
```bash
# Should exist
test -d docs/integration && echo "✓ docs/integration created"
test -f docs/integration/README.md && echo "✓ Postman guide moved"
test -f docs/archive/handoffs/handoff-M5.md && echo "✓ Handoffs archived"
test -f docs/archive/benchmarks/API-performance.html && echo "✓ Benchmarks archived"
```

### Files to Move
```
docs/
├── postman-collection.json               [MOVE → integration/]
├── postman-env.staging.json              [MOVE → integration/]
├── POSTMAN_GUIDE.md                      [MOVE → integration/README.md]
├── examples/                             [MOVE → integration/examples/]
│   ├── AI_GATEWAY.md
│   ├── chat.md
│   ├── postman-mcp.json
│   └── tenant-aware-handler.ts
├── handoff-M5.md                         [MOVE → archive/handoffs/]
├── m5-handoff.md                         [MOVE → archive/handoffs/]
├── m5-m6-handoff.md                      [MOVE → archive/handoffs/]
├── m6-m7-handoff.md                      [MOVE → archive/handoffs/]
├── handoff-M8.md                         [MOVE → archive/handoffs/]
└── m4-results/                           [MOVE → archive/benchmarks/m4-results/]

Root:
└── API-performance.html                  [MOVE → docs/archive/benchmarks/]
```

---

## Phase 6: Root-Level Documentation Rationalization

### Status: ✅ READY TO EXECUTE

```bash
# Move root CLAUDE.md to docs/
mv CLAUDE.md docs/

# Move root SECURITY.md to docs/
# (Can keep root copy as redirect)
mv SECURITY.md docs/SECURITY.md.md  # Or create as link
```

### Files Affected
```
Root:
├── CLAUDE.md                             [MOVE → docs/]
└── SECURITY.md                           [MOVE → docs/]
```

**Alternative for SECURITY.md**: Keep in root + create symlink/redirect:
```bash
# Create redirect in root SECURITY.md
echo "See [docs/SECURITY.md](docs/SECURITY.md)" > SECURITY.md
```

---

## Phase 7: Tenants Directory Enhancement

### Status: ✅ READY TO EXECUTE

#### Step 1: Standardize Environment Files
```bash
# For each tenant:
for tenant in tenants/*/; do
  cd "$tenant"
  
  # Rename .env to .env.example
  if [ -f .env ]; then
    mv .env .env.example
  fi
  
  # Create .env.local for local overrides (empty)
  touch .env.local
  
  cd ../..
done
```

#### Step 2: Create Tenant READMEs
```bash
# Root tenants/ README
cat > tenants/README.md << 'EOF'
# Multi-Tenant Configuration

This directory contains configuration files for each tenant.

## Tenant Structure

Each tenant folder contains:
- `tenant.config.json` - Tenant metadata (tenantId, account IDs, AI models)
- `wrangler.jsonc` - Cloudflare Workers configuration
- `.env.example` - Environment variable template
- `.env.local` - Local overrides (git-ignored)

## Adding a New Tenant

1. Copy an existing tenant folder as template
2. Update `tenant.config.json` with new `tenantId`
3. Configure `wrangler.jsonc` with your Cloudflare account
4. Copy `.env.example` to `.env.local`, fill in secrets
5. Run `npm run validate-config -- --tenant=<name>`

## Tenant Configuration Schema

See `TENANTS-CONFIG-SCHEMA.md` for the full `tenant.config.json` schema.

EOF

# Per-tenant README (mrrainbowsmoke example)
cat > tenants/mrrainbowsmoke/README.md << 'EOF'
# Tenant: mrrainbowsmoke

Account ID: [from tenant.config.json]
Environment: staging/production

## Quick Start

1. Copy `.env.example` to `.env.local`
2. Fill in missing values
3. `npm run dev -- --tenant=mrrainbowsmoke`

## Configuration Files

- `tenant.config.json` - Metadata
- `wrangler.jsonc` - Worker bindings & routes
- `.env.local` - Secrets (git-ignored)

EOF
```

### Files to Create/Modify
```
tenants/
├── README.md                             [CREATE]
├── TENANTS-CONFIG-SCHEMA.md              [CREATE - copy from docs guidance]
├── mrrainbowsmoke/
│   ├── README.md                         [CREATE]
│   ├── .env                              [RENAME → .env.example]
│   ├── .env.local                        [CREATE - empty]
│   ├── .env.dev                          [DELETE or merge into .env.example]
│   ├── .env.stg                          [DELETE or merge into .env.example]
│   └── ...
└── rainbowsmokeofficial/
    └── (same as above)
```

---

## Phase 8: Scripts Directory Organization

### Status: ✅ READY TO EXECUTE

```bash
# Create directory structure
mkdir -p scripts/deployment
mkdir -p scripts/development
mkdir -p scripts/validation
mkdir -p scripts/testing
mkdir -p scripts/setup

# Move deployment scripts
mv scripts/deploy-all.mjs scripts/deployment/
mv scripts/deploy-tenant.mjs scripts/deployment/

# Move development scripts
mv scripts/dev.mjs scripts/development/
mv scripts/chat-dev.mjs scripts/development/
mv scripts/smoke-dev.mjs scripts/development/

# Move validation/diagnostics
mv scripts/detect-drift.mjs scripts/validation/
mv scripts/validate-config.mjs scripts/validation/

# Move testing scripts
mv scripts/load-test.ts scripts/testing/

# Move setup scripts
mv scripts/generate-tenant-index.mjs scripts/setup/

# Create scripts README
cat > scripts/README.md << 'EOF'
# Development Scripts

Scripts organized by purpose:

## deployment/ - Production deployment automation
- `deploy-all.mjs` - Deploy all tenants
- `deploy-tenant.mjs` - Deploy single tenant

## development/ - Local development tools
- `dev.mjs` - Start dev server
- `chat-dev.mjs` - Chat CLI tool
- `smoke-dev.mjs` - Smoke tests

## validation/ - Config & diagnostics
- `validate-config.mjs` - Validate tenant configs
- `detect-drift.mjs` - Check config drift

## testing/ - Performance & load testing
- `load-test.ts` - Load testing suite

## setup/ - One-time setup
- `generate-tenant-index.mjs` - Generate tenant registry

## lib/ - Shared utilities
Reusable code used by above scripts.

EOF
```

### Files to Move
```
scripts/
├── deploy-all.mjs                        [MOVE → deployment/]
├── deploy-tenant.mjs                     [MOVE → deployment/]
├── dev.mjs                               [MOVE → development/]
├── chat-dev.mjs                          [MOVE → development/]
├── smoke-dev.mjs                         [MOVE → development/]
├── detect-drift.mjs                      [MOVE → validation/]
├── validate-config.mjs                   [MOVE → validation/]
├── load-test.ts                          [MOVE → testing/]
├── generate-tenant-index.mjs             [MOVE → setup/]
└── lib/                                  [KEEP in scripts/]
```

---

## Phase 9: Environment & Config Best Practices

### Status: ✅ READY TO EXECUTE

Update `.gitignore`:
```bash
cat >> .gitignore << 'EOF'

# Environment & Secrets
.env
.env.local
.env.*.local
.env.example.local
tenants/**/.env
tenants/**/.env.local
tenants/**/.env.*.local

# Development
.wrangler/
dist/
build/

EOF
```

Create environment guide:
```bash
cat > docs/guides/environment-setup.md << 'EOF'
# Environment Setup Guide

## Local Configuration

### Root Repository
Copy .env.example to .env.local

### Per-Tenant Configuration

Each tenant has environment variables defined in:
- `.env.example` - Template
- `.env.local` - Local overrides (git-ignored)

### Common Variables

[List all env vars used by the system]

See `tenants/[tenant]/.env.example` for complete reference.

EOF
```

---

## Phase 10: Add Missing README Files

### Status: ✅ READY TO EXECUTE

```bash
# Create test directory README
cat > tests/README.md << 'EOF'
# Test Suite

Unit and integration tests for the monorepo.

## Running Tests

\`\`\`bash
npm test
nx run worker-api:test
nx affected:test
\`\`\`

## Test Organization

- `*.spec.ts` - Unit/integration tests
- `fixtures/` - Test data & mocks

See [docs/guides/testing.md](../docs/guides/testing.md) for full testing strategy.

EOF

# Create archive README
cat > archive/README.md << 'EOF'
# Archive

Historical records and old session data.

## Contents

- `sessions-backup/` - Session archives (compressed)
- `deployment-history/` - Past deployment logs by date
- `scripts/` - Historical scripts
- `agent-outputs/` - Archived AI agent deliverables
- `docs/archive/` - Historical documentation

See `[subdirectory]/README.md` for details.

EOF
```

---

## Phase 11: Add Consolidation & Reference Docs

### Status: ✅ READY TO EXECUTE

```bash
# Create root REPOSITORY-STRUCTURE.md (already done above)
# Add master index in docs/README.md

cat > docs/README.md << 'EOF'
# Documentation

Welcome to the Crispy Enigma documentation.

## Start Here

- [First Time Setup](FIRST-TIME-SETUP.md) - New to the project?
- [Architecture Overview](architecture/) - How the system works
- [Getting Started](guides/getting-started.md) - Run your first command

## By Topic

- **[Architecture](architecture/)** - System design, bindings, metrics
- **[Guides](guides/)** - How-to documentation
- **[API & Integration](integration/)** - Postman, examples
- **[Deployment](deployment/)** - Multi-account setup
- **[Runbooks](runbooks/)** - Operations & incident response

## For Reference

- [PROJECT-STATUS.md](PROJECT-STATUS.md) - Current milestone
- [SECURITY.md](SECURITY.md) - Security practices
- [tool-contracts.md](tool-contracts.md) - Tool API contracts

## For Developers

- [Development Guide](guides/development-guide.md)
- [Testing Strategy](guides/testing.md)
- [Troubleshooting](guides/troubleshooting.md)

EOF

# Create FIRST-TIME-SETUP.md
cat > docs/FIRST-TIME-SETUP.md << 'EOF'
# First Time Setup

Welcome! Follow these steps to get the project running locally.

## Prerequisites

- Node.js 18+ 
- npm 9+
- Cloudflare account
- Git

## Quick Start

1. Clone repository
   \`\`\`bash
   git clone <repo>
   cd crispy-enigma
   \`\`\`

2. Install dependencies
   \`\`\`bash
   npm install
   \`\`\`

3. Configure a tenant
   \`\`\`bash
   cd tenants/mrrainbowsmoke
   cp .env.example .env.local
   # Edit .env.local with your values
   cd ../..
   \`\`\`

4. Start dev server
   \`\`\`bash
   npm run dev -- --tenant=mrrainbowsmoke
   \`\`\`

5. Test the API
   \`\`\`bash
   curl http://localhost:8787/health
   \`\`\`

## What Now?

- Read [Architecture Overview](architecture/)
- Try [Chat Guide](guides/chat.md)
- Run tests: \`npm test\`

Need help? See [Troubleshooting](guides/troubleshooting.md)

EOF
```

---

## Final Verification Checklist

### ✅ Pre-Implementation
- [ ] All session data backed up to `archive/sessions-backup/`
- [ ] No uncommitted changes in git (review with `git status`)
- [ ] Disk space available (~500MB for safety)

### ✅ Post-Implementation  
```bash
# Verify no unintended deletions
git status | grep "deleted:"  # Should only show planned deletions

# Verify structure
test -d docs/integration && echo "✓ docs/integration exists"
test -d scripts/deployment && echo "✓ scripts/deployment exists"
test -f archive/deployment-history/2026-02-08/index.json && echo "✓ Deployment manifest created"

# Verify NX is untouched
test -f nx.json && echo "✓ nx.json preserved"
ls docs/nx/*.md | wc -l  # Should be 9 (consolidated)

# Checks pass
npm install  # No errors
npm run typecheck  # No errors
```

### ✅ Git Commit
```bash
git add -A
git status  # Review everything

# Create commit
git commit -m "refactor: repo structure consolidation & cleanup

- Remove wrangler dev cache (~80MB)
- Archive deployment logs with index
- Consolidate docs structure (integration/, archive/)
- Reorganize scripts by purpose (deployment/, development/, etc)
- Enhance tenant setup (README, .env.example)
- Add missing documentation (README, first-time setup)

NX-protected items left untouched:
- docs/agents.nx-phase.prompt.yaml
- docs/nx/ (consolidated NX docs)
- nx.json
- packages/nx-cloudflare (NX plugin)

See REPO-CLEANUP-PLAN.md & REPOSITORY-STRUCTURE.md for details.
"

git log --oneline -1  # Verify commit
```

---

## Rollback Instructions (If Needed)

```bash
# If something goes wrong, restore from git
git reset --hard HEAD~1

# Restore deleted wrangler cache (can be regenerated)
npm run dev -- --tenant=mrrainbowsmoke  # Auto-generates

# Restore session archives if needed
cd archive/sessions-backup
tar -xzf copilot-session-*.tar.gz
```

---

## Timeline Estimate

| Phase | Complexity | Time |
|-------|-----------|------|
| Phase 1: Wrangler cache | ⚡ | 2 min |
| Phase 2: Sessions | ⚡ | 3 min |
| Phase 3: Deployments | ⚡ | 5 min |
| Phase 4: Archive | ⚡ | 3 min |
| Phase 5: Docs | 🟡 | 15 min |
| Phase 6: Root docs | ⚡ | 2 min |
| Phase 7: Tenants | 🟡 | 10 min |
| Phase 8: Scripts | 🟡 | 10 min |
| Phase 9: Env config | ⚡ | 5 min |
| Phase 10: READMEs | 🟡 | 15 min |
| Phase 11: Master docs | 🟡 | 15 min |
| **Total** | | **~80 min** |

**Parallel Execution**: To speed up, phases 1-4 can run first (~10 min), then 5-11 in parallel (~60 min).

---

## Gemini Parallel Execution (Runs During Cleanup)

**Gemini's Role**: Architecture Analysis + Refactoring Opportunities  
**Scope**: Runs concurrently with cleanup phases (non-blocking)  
**Output**: 7 analysis documents in `docs/archive/analysis/`  
**Timeline**: Complete by end of cleanup execution

### Gemini's Phase Timeline

```
Cleanup Phases 1-2     ← Gemini starts repo analysis
Cleanup Phases 3-5     ← Gemini performs test coverage audit
Cleanup Phases 6-8     ← Gemini conducts architecture review
Cleanup Phases 9-11    ← Gemini aligns best practices
         ↓
    ALL COMPLETE       ← Gemini delivers refactoring roadmap
```

### Gemini's Deliverables

By the end of cleanup, expect these in `docs/archive/analysis/`:

1. **REFACTORING-OPPORTUNITIES.md** - High/Medium/Low priority code improvements
2. **TEST-COVERAGE-REPORT.md** - Coverage % by package & gaps
3. **TENANT-ISOLATION-AUDIT.md** - Tenant context enforcement verification
4. **TYPE-SAFETY-AUDIT.md** - Type consistency across packages
5. **ERROR-HANDLING-PATTERNS.md** - Error model consistency review
6. **BEST-PRACTICES-ALIGNMENT.md** - Cloudflare & multi-tenant patterns
7. **ARCHITECTURE-SCORE.md** - Overall health scorecard & prioritized roadmap

### Invoke Gemini (Start After Phase 1)

```bash
# After you start cleanup phases 1-2, invoke Gemini's parallel analysis
gemini analyze-repo \
  --path=/home/dfox/projects-cf/crispy-enigma \
  --focus=architecture,testing,patterns,refactoring \
  --yolo \
  --output=docs/archive/analysis/ \
  --async

# Check progress
gemini status --task=repo-analysis

# Retrieve final results (after cleanup complete)
gemini get-analysis --output=docs/archive/analysis/
```

**Details**: See GEMINI-REFACTORING-GUIDE.md for full Gemini analysis scope & deliverables.

---

**Status**: ✅ **Ready to Execute**  
**Team**: Claude (Architect) + Copilot (DX) + Gemini (QA/Refactoring)  
**Last Updated**: 2026-02-08  
**Prepared By**: Claude + Copilot + Gemini Team
