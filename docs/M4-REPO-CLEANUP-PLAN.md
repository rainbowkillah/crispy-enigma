# M4 Repository Cleanup Plan

**Status:** Final - Ready for Execution
**Date:** 2026-02-07
**Context:** Pre-M4 staging deployment cleanup

---

## Executive Summary

Repository reindex reveals **three critical issues** blocking clean M4 staging deployment:
1. **Build artifacts tracked in git** (.nx/ with 29 files, ~728K) causing dirty git status
2. **Duplicate documentation** (docs/ + wiki-content/) creating maintenance burden
3. **Milestone file sprawl** (21 files across M0-M4) cluttering docs/

**Impact:** Remove ~912K from git tracking (13.8% reduction), establish single source of truth for docs, improve discoverability.

**Timeline:** P0 items (~15 min) required before M4 staging; P1-P2 items can follow.

---

## Repository Analysis

### Workspace Overview
- **Nx Projects**: 6 total (5 libraries + 1 application)
  - Libraries: `ai`, `core`, `observability`, `rag`, `storage`
  - Application: `worker-api`
- **Working Directory Size**: ~353M
- **Git-Tracked Size**: ~6.6M (excluding node_modules)

### Size Breakdown
```
343M  node_modules/         ✅ .gitignored
736K  archive/              ✅ .gitignored
728K  .nx/                  ⚠️ TRACKED (29 files) - MUST REMOVE
484K  docs/                 📝 Needs consolidation
428K  tenants/              ✅ Clean
200K  package-lock.json     ✅ Required
196K  packages/             ✅ Clean source code
176K  wiki-content/         ⚠️ TRACKED - Duplicate docs
116K  tests/                ✅ Clean
60K   apps/                 ✅ Clean
8K    .wrangler/            ✅ .gitignored
```

### Current Git Status
```
M  .nx/workspace-data/file-map.json      # Modified build cache
M  .nx/workspace-data/nx_files.nxt       # Modified build cache
?? docs/M4-REPO-CLEANUP-PLAN.md          # This file
```

---

## Critical Issues

### Issue #1: Build Artifacts in Git ⚠️ HIGH PRIORITY
**Problem:** .nx/ directory has 29 files tracked (~728K)
- `.nx/cache/run.json`
- `.nx/cache/terminalOutputs/*` (21 terminal output files)
- `.nx/workspace-data/*.{db,json,nxt,hash}` (build cache, currently modified)

**Root Cause:** `.gitignore` missing `.nx/` entry
**Impact:** Pollutes git history, causes merge conflicts, wastes storage
**Blocks:** Clean git status for M4 staging

**Solution:**
```bash
git rm --cached -r .nx/
echo "" >> .gitignore
echo "# Nx build cache and workspace data" >> .gitignore
echo ".nx/" >> .gitignore
git add .gitignore
git commit -m "chore: remove .nx build cache from git tracking"
```

### Issue #2: Log Files in Git ⚠️ MEDIUM PRIORITY
**Problem:** `test-output.log` (4K) tracked at repo root

**Root Cause:** `*.log` in .gitignore not applied retroactively
**Impact:** Noise in git status

**Solution:**
```bash
git rm --cached test-output.log
# *.log already in .gitignore, will prevent future tracking
```

### Issue #3: Personal Tool Config in Git ℹ️ LOW PRIORITY
**Problem:** `.gemini/settings.json` tracked (personal AI assistant config)

**Discussion:** `.vscode/settings.json` is acceptable (team workspace), but `.gemini/` is personal preference

**Solution:**
```bash
git rm --cached -r .gemini/
echo "" >> .gitignore
echo "# Personal AI assistant configs" >> .gitignore
echo ".claude/" >> .gitignore
echo ".gemini/" >> .gitignore
```

### Issue #4: Documentation Duplication 📚 MEDIUM PRIORITY
**Problem:** Two documentation systems creating content drift

| docs/ File | wiki-content/ File | Status |
|-----------|-------------------|--------|
| `architecture.md` (16K) | `Architecture.md` | DUPLICATE |
| `tenancy.md` (16K) | `Multi-Tenancy.md` | DUPLICATE |
| `security.md` (8K) | `Security-Best-Practices.md` | DUPLICATE |
| `testing.md` (8K) | `Testing-Guide.md` | DUPLICATE |
| N/A | `Getting-Started.md` | UNIQUE |
| N/A | `Troubleshooting.md` | UNIQUE |
| N/A | `API-Reference.md` | UNIQUE |
| N/A | `Development-Guide.md` | UNIQUE |

**Decision:** Keep `docs/` as canonical source
- Reason 1: Contains ADRs, examples, m4-results (structured reference)
- Reason 2: Referenced in `CLAUDE.md` (`agents.prompt.yaml`)
- Reason 3: Integrated milestone tracking

**Solution:** See "Phase 2: Documentation Consolidation" below

### Issue #5: Milestone File Sprawl 📁 MEDIUM PRIORITY
**Problem:** 21 milestone files scattered in docs/ root making navigation difficult

**M0-M3 Historical Files** (11 files, ~88K):
```
M0-COMPLETE.md, M1-PREP.md, M2-PREP.md, M3-PREP.md
handoff-M0.md, handoff-M1.md, handoff-M2.md, handoff-M3.md
handoff-PR.md, PR.md, PR-SUMMARY.md
```

**M4 Current Files** (10 files, ~104K):
```
M4-PREP.md, M4-CODEX-PLAN.md, M4-CODEX-PROMPTS.md
M4-COMPLETION-ROLLUP.md, M4-ISSUES-QUICK-REF.md, M4-NOTES.md
M4-PR-SUMMARY.md, M4-STAGING-DEPLOYMENT.md
M4-STAGING-VALIDATION-RESULTS.md, M4-REPO-CLEANUP-PLAN.md
```

**Impact:** Hard to find single source of truth, poor discoverability

**Solution:** See "Phase 3: Milestone Restructure" below

---

## Cleanup Strategy

### Goals
1. ✅ Achieve clean git status for M4 staging deployment
2. ✅ Reduce git-tracked size by ~912K (13.8%)
3. ✅ Establish single documentation source of truth
4. ✅ Improve documentation discoverability
5. ✅ Set pattern for future milestone organization

### Proposed .gitignore Additions
```gitignore
# Nx build cache and workspace data
.nx/

# Personal AI assistant configs
.claude/
.gemini/

# Test artifacts (*.log already present)
test-output.log
*.test.log

# Local temporary directories
.local/
temp/
tmp/

# Tenant-specific build artifacts (if needed)
tenants/**/.wrangler/
```

### Target Documentation Structure
```
docs/
├── README.md                    # Documentation index (NEW)
├── plan.md                      # Master project plan (KEEP)
├── PROJECT-STATUS.md            # Current status dashboard (KEEP)
├── quick-reference.md           # Quick reference guide (KEEP)
├── agents.prompt.yaml           # Agent orchestration (KEEP)
│
├── architecture/                # Core technical docs (NEW)
│   ├── architecture.md          # System architecture
│   ├── tenancy.md              # Multi-tenancy design
│   ├── bindings.md             # Cloudflare bindings
│   ├── failure-modes.md        # Failure analysis
│   ├── footguns.md             # Anti-patterns
│   └── metrics.md              # Observability
│
├── guides/                      # User-facing guides (NEW)
│   ├── getting-started.md      # From wiki-content
│   ├── development-guide.md    # From wiki-content
│   ├── testing.md              # Existing
│   ├── security.md             # Existing
│   ├── troubleshooting.md      # From wiki-content
│   └── api-reference.md        # From wiki-content
│
├── adrs/                        # Architecture Decision Records (KEEP)
│   ├── ADR-001-sse-streaming.md
│   ├── ADR-002-separate-do-namespaces.md
│   ├── ADR-003-sliding-window-rate-limiting.md
│   └── ADR-004-model-selection-precedence.md
│
├── examples/                    # Code examples (KEEP)
│   ├── chat.md
│   └── tenant-aware-handler.ts
│
├── milestones/                  # Active & planned milestones
│   ├── M4/                      # Current milestone (CONSOLIDATED)
│   │   ├── PLAN.md             # Scope & prep (M4-PREP + M4-CODEX-PLAN)
│   │   ├── STATUS.md           # Results & completion (M4-COMPLETION-ROLLUP + M4-STAGING-VALIDATION-RESULTS)
│   │   ├── DEPLOYMENT.md       # M4-STAGING-DEPLOYMENT
│   │   ├── NOTES.md            # M4-NOTES + M4-ISSUES-QUICK-REF
│   │   └── REPO-CLEANUP.md     # This file
│   └── M5/                      # Next milestone
│       └── PREP.md
│
├── archive/                     # Completed milestones (NEW)
│   └── milestones/
│       ├── M0/
│       │   ├── COMPLETE.md
│       │   └── handoff.md
│       ├── M1/
│       │   ├── PREP.md
│       │   └── handoff.md
│       ├── M2/
│       │   ├── PREP.md
│       │   └── handoff.md
│       └── M3/
│           ├── PREP.md
│           └── handoff.md
│
├── tooling/                     # Development tooling (NEW)
│   ├── CODEX-PROMPTS.md        # M4-CODEX-PROMPTS
│   └── PR-TEMPLATE.md          # Standardized PR template
│
└── m4-results/                  # Test results (KEEP)
    ├── response.json
    ├── response-cache.json
    └── response-search.json
```

---

## Implementation Plan

### Phase 1: Remove Build Artifacts (P0 - REQUIRED FOR M4 STAGING)
**Effort:** ~15 minutes
**Blocks:** M4 staging deployment

**Steps:**
1. Remove tracked cache files:
   ```bash
   git rm --cached -r .nx/
   git rm --cached test-output.log
   git rm --cached -r .gemini/
   ```

2. Update .gitignore:
   ```bash
   cat >> .gitignore << 'EOF'

   # Nx build cache and workspace data
   .nx/

   # Personal AI assistant configs
   .claude/
   .gemini/

   # Local temporary directories
   .local/
   temp/
   tmp/
   EOF
   ```

3. Commit changes:
   ```bash
   git add .gitignore
   git commit -m "chore: remove build artifacts and tool configs from git tracking

   - Remove .nx/ build cache (29 files, ~728K)
   - Remove test-output.log
   - Remove .gemini/ personal config
   - Update .gitignore to prevent future tracking

   Impact: Reduces git-tracked size by ~736K"
   ```

4. Verify:
   ```bash
   git status                    # Should show clean working tree
   ls -la .nx/                   # Should still exist locally
   git ls-files .nx/             # Should return nothing
   nx run-many -t test           # Should pass
   ```

**Success Criteria:**
- ✅ `git status` shows clean working tree
- ✅ `.nx/` still exists locally but not tracked
- ✅ All Nx commands still work

### Phase 2: Documentation Consolidation (P1 - RECOMMENDED FOR M4 STAGING)
**Effort:** ~30 minutes
**Improves:** Documentation clarity and maintenance

**Steps:**
1. Create new directory structure:
   ```bash
   mkdir -p docs/architecture
   mkdir -p docs/guides
   mkdir -p docs/tooling
   ```

2. Move existing files to architecture/:
   ```bash
   git mv docs/architecture.md docs/architecture/
   git mv docs/tenancy.md docs/architecture/
   git mv docs/bindings.md docs/architecture/
   git mv docs/failure-modes.md docs/architecture/
   git mv docs/footguns.md docs/architecture/
   git mv docs/metrics.md docs/architecture/
   ```

3. Move existing files to guides/:
   ```bash
   git mv docs/testing.md docs/guides/
   git mv docs/security.md docs/guides/
   git mv docs/streaming.md docs/guides/
   git mv docs/sessions.md docs/guides/
   git mv docs/rate-limiting.md docs/guides/
   git mv docs/ai-gateway.md docs/guides/
   git mv docs/ai-gateway-fallbacks.md docs/guides/
   git mv docs/vectorize-dev.md docs/guides/
   git mv docs/wrangler.md docs/guides/
   ```

4. Migrate unique content from wiki-content/:
   ```bash
   # Review and merge unique content
   cp wiki-content/Getting-Started.md docs/guides/getting-started.md
   cp wiki-content/Troubleshooting.md docs/guides/troubleshooting.md
   cp wiki-content/API-Reference.md docs/guides/api-reference.md
   cp wiki-content/Development-Guide.md docs/guides/development-guide.md

   # Stage merged files
   git add docs/guides/getting-started.md
   git add docs/guides/troubleshooting.md
   git add docs/guides/api-reference.md
   git add docs/guides/development-guide.md
   ```

5. Remove wiki-content/:
   ```bash
   git rm -r wiki-content/
   ```

6. Create documentation index:
   ```bash
   # Create docs/README.md with navigation links
   # (Content to be determined based on final structure)
   git add docs/README.md
   ```

7. Commit changes:
   ```bash
   git commit -m "docs: consolidate documentation into single source of truth

   - Reorganize docs/ into architecture/, guides/, and tooling/
   - Migrate unique content from wiki-content/
   - Remove wiki-content/ directory (~176K)
   - Create docs/README.md as documentation index

   Impact: Eliminates documentation duplication, improves discoverability"
   ```

8. Update cross-references:
   ```bash
   # Update README.md links
   # Update CLAUDE.md if needed
   # Verify all internal links resolve
   git add README.md CLAUDE.md
   git commit -m "docs: update cross-references after reorganization"
   ```

**Success Criteria:**
- ✅ Single documentation source (docs/)
- ✅ All unique wiki-content/ merged
- ✅ docs/README.md provides clear navigation
- ✅ All cross-references in README.md and CLAUDE.md resolve

### Phase 3: Milestone Restructure (P2 - POST-STAGING)
**Effort:** ~35 minutes
**Improves:** Documentation organization

**Steps:**
1. Create archive structure:
   ```bash
   mkdir -p docs/archive/milestones/{M0,M1,M2,M3}
   mkdir -p docs/milestones/M4
   mkdir -p docs/tooling
   ```

2. Archive M0-M3:
   ```bash
   # M0
   git mv docs/M0-COMPLETE.md docs/archive/milestones/M0/COMPLETE.md
   git mv docs/handoff-M0.md docs/archive/milestones/M0/handoff.md

   # M1
   git mv docs/M1-PREP.md docs/archive/milestones/M1/PREP.md
   git mv docs/handoff-M1.md docs/archive/milestones/M1/handoff.md

   # M2
   git mv docs/M2-PREP.md docs/archive/milestones/M2/PREP.md
   git mv docs/handoff-M2.md docs/archive/milestones/M2/handoff.md

   # M3
   git mv docs/M3-PREP.md docs/archive/milestones/M3/PREP.md
   git mv docs/handoff-M3.md docs/archive/milestones/M3/handoff.md

   # PR-related (generic)
   git mv docs/PR.md docs/archive/milestones/PR.md
   git mv docs/PR-SUMMARY.md docs/archive/milestones/PR-SUMMARY.md
   git mv docs/handoff-PR.md docs/archive/milestones/handoff-PR.md
   ```

3. Consolidate M4:
   ```bash
   # Move all M4 files
   git mv docs/M4-PREP.md docs/milestones/M4/
   git mv docs/M4-CODEX-PLAN.md docs/milestones/M4/
   git mv docs/M4-COMPLETION-ROLLUP.md docs/milestones/M4/
   git mv docs/M4-STAGING-VALIDATION-RESULTS.md docs/milestones/M4/
   git mv docs/M4-STAGING-DEPLOYMENT.md docs/milestones/M4/
   git mv docs/M4-NOTES.md docs/milestones/M4/
   git mv docs/M4-ISSUES-QUICK-REF.md docs/milestones/M4/
   git mv docs/M4-PR-SUMMARY.md docs/milestones/M4/
   git mv docs/M4-REPO-CLEANUP-PLAN.md docs/milestones/M4/

   # Move codex prompts to tooling
   git mv docs/M4-CODEX-PROMPTS.md docs/tooling/CODEX-PROMPTS.md

   # Create consolidated files (merge content manually)
   # PLAN.md: M4-PREP + M4-CODEX-PLAN
   # STATUS.md: M4-COMPLETION-ROLLUP + M4-STAGING-VALIDATION-RESULTS
   # DEPLOYMENT.md: M4-STAGING-DEPLOYMENT
   # NOTES.md: M4-NOTES + M4-ISSUES-QUICK-REF
   ```

4. Update M5:
   ```bash
   git mv docs/M5-PREP.md docs/milestones/M5/PREP.md
   ```

5. Commit changes:
   ```bash
   git commit -m "docs: restructure milestone documentation

   - Archive M0-M3 to docs/archive/milestones/
   - Consolidate M4 files into docs/milestones/M4/
   - Move M5-PREP to docs/milestones/M5/
   - Extract codex prompts to docs/tooling/

   Impact: Improved organization, clear milestone structure"
   ```

**Success Criteria:**
- ✅ M0-M3 archived in docs/archive/milestones/
- ✅ M4 consolidated in docs/milestones/M4/
- ✅ Tooling extracted to docs/tooling/
- ✅ Clear pattern established for future milestones

---

## Priority Matrix

| Task | Priority | Impact | Effort | Required For |
|------|----------|--------|--------|--------------|
| Remove .nx/ from git | **P0** | High | 5 min | M4 staging ✓ |
| Remove test-output.log | **P0** | Low | 2 min | Clean status ✓ |
| Update .gitignore | **P0** | High | 5 min | Phase 1 ✓ |
| Remove .gemini/ | P1 | Low | 2 min | - |
| Consolidate wiki-content/ | P1 | Medium | 30 min | Doc clarity |
| Restructure docs/ | P1 | Medium | 15 min | Organization |
| Archive M0-M3 | P2 | Medium | 15 min | - |
| Consolidate M4 | P2 | Medium | 20 min | M4 closeout |

**Pre-M4 Staging Requirements:**
- ✅ **MUST DO (P0):** Phase 1 - Remove build artifacts (~15 min)
- 🔄 **SHOULD DO (P1):** Phase 2 - Documentation consolidation (~30 min)
- ⏸️ **CAN DEFER (P2):** Phase 3 - Milestone restructure (~35 min)

---

## Validation & Verification

### After Phase 1 (Build Artifacts Removal)
```bash
# Verify git status
git status                           # Should be clean (or only intended changes)

# Verify .nx/ not tracked
ls -la .nx/                          # Should exist locally
git ls-files .nx/                    # Should return nothing

# Verify functionality
nx run-many -t test                  # All tests should pass
nx run worker-api:dev                # Development should work
```

**Expected:**
- ✅ Clean git status
- ✅ `.nx/` exists locally but not tracked
- ✅ All nx commands functional

### After Phase 2 (Documentation Consolidation)
```bash
# Verify structure
find docs/ -type d                   # Should show new directory structure
find docs/ -name "*.md" | wc -l      # Should be reduced from 54

# Verify wiki-content removed
git ls-files wiki-content/           # Should return nothing
ls -la wiki-content/                 # Should not exist

# Verify cross-references
grep -r "wiki-content/" README.md    # Should return nothing
grep -r "wiki-content/" docs/        # Should return nothing (except archives)
```

**Expected:**
- ✅ Organized docs/ structure
- ✅ wiki-content/ removed
- ✅ All cross-references updated

### After Phase 3 (Milestone Restructure)
```bash
# Verify milestone organization
ls -la docs/archive/milestones/      # Should contain M0-M3
ls -la docs/milestones/              # Should contain M4, M5

# Verify root docs/ cleanup
ls docs/*.md                         # Should only show key files

# Full test suite
npm test                             # All tests pass
nx run-many -t test typecheck        # All projects pass
```

**Expected:**
- ✅ Milestones archived/consolidated
- ✅ Clean docs/ root directory
- ✅ All tests passing

### Final Verification
```bash
# Review changes
git log --oneline -10                # Review commit history
git diff main --stat                 # Review file changes

# Size verification
du -sh docs/                         # Should be reduced
git ls-files | wc -l                 # Fewer tracked files

# Full validation
npm test                             # Complete test suite
nx graph                             # Verify project graph
```

---

## Size Impact Summary

**Current State:**
- Git-tracked: ~6.6M
- Working directory: ~353M

**Removals:**
- .nx/ cache: ~728K
- .gemini/: ~4K
- test-output.log: ~4K
- wiki-content/: ~176K (after content merge)
- **Total**: ~912K

**After Cleanup:**
- Git-tracked: ~5.7M (**13.8% reduction**)
- Working directory: ~353M (no change - local caches retained)

---

## Notes

### What This Cleanup Preserves
- ✅ All source code unchanged
- ✅ All package configurations unchanged
- ✅ Local .nx/ cache (for build performance)
- ✅ All unique documentation content
- ✅ Complete milestone history (in archives)
- ✅ All test files and configurations

### What This Cleanup Removes from Git
- ⚠️ Build cache artifacts (.nx/)
- ⚠️ Duplicate documentation (wiki-content/)
- ⚠️ Personal tool configs (.gemini/)
- ⚠️ Test output logs

### Post-Cleanup Maintenance
- Use `docs/milestones/MX/` pattern for future milestones
- Keep root docs/ for master plan and status only
- Archive completed milestones to `docs/archive/milestones/`
- Maintain single source of truth in `docs/`

---

## Approval & Execution

**Ready for execution:** Yes ✓
**Blocking issues:** None
**Risk level:** Low (changes are reversible, no code modifications)

**Recommended approach:**
1. Execute Phase 1 (P0) before M4 staging deployment
2. Execute Phase 2 (P1) during M4 staging window
3. Defer Phase 3 (P2) to post-staging cleanup

**Sign-off required from:** Repository owner / Project lead
