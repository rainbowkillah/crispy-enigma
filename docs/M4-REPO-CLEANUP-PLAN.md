# M4 Repository Cleanup Plan

**Status:** Updated 2026-02-07

## Findings (reindex snapshot)

- Total repo size (working copy): ~353M
- Largest areas are local-only artifacts:
  - node_modules/: ~343M
  - .git/: ~6.6M
  - .nx/cache/: ~728K
- Content-heavy but modest folders:
  - docs/: ~480K
  - archive/: ~736K (already ignored by .gitignore)
  - tests/: ~116K
- **Documentation Sprawl**: There is significant duplication and fragmentation of milestone-related documents. For a single milestone, there can be `PREP`, `PLAN`, `HANDOFF`, `COMPLETION`, `PR-SUMMARY`, and `CODEX-PROMPTS` files, making it hard to find the single source of truth.
- **Inconsistent Ignores**: `.gitignore` is missing entries for common local development artifacts like `.nx/cache`, `.claude/`, and `.gemini/`.

Note: `.gitignore` already excludes `node_modules/`, `archive/*`, and `.wrangler/`.

## Goals

- Keep the repo lean for M4 staging deployment.
- Reduce noise from generated/cache folders.
- Consolidate documentation sources to avoid drift.
- Improve documentation discoverability.
- Establish clear patterns for future documentation.

## Proposed cleanup plan (no code changes yet)
## Proposed Cleanup Plan

1) Tighten ignores for local artifacts
   - Add .gitignore entries for .nx/, .claude/, .gemini/, test-output.log, and any other local tool caches.
   - Verify no cache folders are tracked in git history; if they are, remove from index (git rm --cached).
### 1. Tighten `.gitignore` for Local Artifacts
Add the following to the root `.gitignore` file to exclude tool-specific caches and logs.

2) Consolidate documentation sources
   - Decide one canonical documentation root between docs/ and wiki-content/.
   - If docs/ is canonical, move wiki-content/ into docs/wiki/ and add a short index page mapping old wiki paths.
   - If wiki-content/ is canonical, move docs/ guides into wiki-content/sections/ and update README.md references.
```gitignore
# Nx
.nx/cache

3) Archive historical M0-M3 materials
   - Move older milestone prep/hand-off docs into docs/archive/ (or keep only the latest milestone summary in docs/).
   - Keep M4 staging docs in docs/milestones/M4/ with a single entry index to reduce duplication.
# AI Assistant Tooling
.claude/
.gemini/

4) Trim historical logs and artifacts
   - Remove any tracked *.log or test-output.log from the repo.
   - Add a standard location for temporary artifacts (e.g., .local/) and ignore it.
# Local logs
*.log
```
Ensure these files are not tracked using `git rm --cached <file>`.

5) Optional: split archival data
   - If archive/ needs to be preserved, migrate it to a separate repo or attach as a release asset.
### 2. Consolidate and Restructure Documentation
The `docs/` directory should be reorganized to group files by purpose and archive completed milestones.

## Suggested sequencing
**A. Create a new structure:**

- Phase 1: Update .gitignore and remove tracked cache files.
- Phase 2: Documentation consolidation and redirects/links.
- Phase 3: Archive split (if needed).
```
docs/
├── architecture/         # Core, persistent architecture docs
│   ├── index.md          # (previously architecture.md)
│   ├── failure-modes.md
│   ├── footguns.md
│   └── metrics.md
├── milestones/           # Active and planned milestone work
│   ├── M4/
│   └── M5/
├── archive/              # Completed milestone docs
│   ├── M0/
│   ├── M1/
│   ├── M2/
│   └── M3/
└── tooling/              # Agent prompts and templates
    ├── AGENTS.md
    ├── M4-CODEX-PROMPTS.md
    └── PR-TEMPLATE.md
```

## Verification checklist
**B. Consolidate Milestone Documents:**

For each milestone (e.g., M4), consolidate the numerous files into a few key documents within `docs/milestones/M4/`:
- **`PLAN.md`**: The initial scope, deliverables, and prep work. (Merges `M4-PREP.md`, `M4-CODEX-PLAN.md`).
- **`STATUS.md`**: A living document for results and completion reports. (Merges `M4-COMPLETION-ROLLUP.md`, `M4-STAGING-VALIDATION-RESULTS.md`).
- **`NOTES.md`**: Any relevant implementation notes.

**C. Archive Old Milestones:**

Move the consolidated folders for M0, M1, M2, and M3 into `docs/archive/`. The primary historical record should be `CHANGELOG.md` and `PROJECT-STATUS.md`.

### 3. Standardize PR and Handoff Documentation

- Create a single `PR-TEMPLATE.md` in `docs/tooling/`.
- Retire the various `PR.md`, `PR-SUMMARY.md`, and `handoff-*.md` files for each milestone. The PR description in the Git provider should be the source of truth for a pull request, using the new template.

### 4. Trim Redundant Root Documents

- After restructuring, remove the now-duplicated files from the root of `docs/` (e.g., `M3-PREP.md`, `handoff-M2.md`, etc.).
- Keep high-level documents like `README.md`, `CHANGELOG.md`, and `PROJECT-STATUS.md` at the project root.

## Suggested Sequencing

- **Phase 1:** Update `.gitignore` and remove any tracked cache files from the index.
- **Phase 2:** Restructure the `docs/` directory and consolidate milestone files.
- **Phase 3:** Update `README.md` and other top-level documents to point to the new locations.

## Verification Checklist

- `git status` is clean after removing cached files from the index.
- `npm test` and `nx` workflows are unchanged.
- Links in `README.md` and `PROJECT-STATUS.md` are updated and resolve correctly.

---

## DETAILED REINDEX ANALYSIS (2026-02-07 16:20 UTC)

### Repository Statistics

**Nx Workspace Overview:**
- **Projects**: 6 total (5 libraries + 1 application)
  - Libraries: `ai`, `core`, `observability`, `rag`, `storage`
  - Application: `worker-api`
- **Source Files**: Clean, well-organized in packages/
- **Dependencies**: Properly managed via npm

**Disk Usage Breakdown:**
```
343M  node_modules/         (✅ .gitignored)
736K  archive/              (✅ .gitignored)
728K  .nx/                  (⚠️ PARTIALLY TRACKED - 29 files in git)
484K  docs/                 (📝 needs consolidation)
428K  tenants/
200K  package-lock.json
196K  packages/
176K  wiki-content/         (⚠️ DUPLICATE docs, tracked in git)
116K  tests/
60K   apps/
20K   scripts/
8K    .wrangler/            (✅ .gitignored)
```

### Critical Issues Requiring Immediate Action

#### Issue #1: Build Artifacts Tracked in Git
**Severity**: HIGH
**Impact**: Pollutes git history, causes merge conflicts, wastes storage

**Files Currently Tracked:**
```bash
.nx/cache/run.json
.nx/cache/terminalOutputs/*    # 21 terminal output cache files
.nx/workspace-data/*.db        # SQLite cache
.nx/workspace-data/*.json      # file-map, project-graph (currently modified)
.nx/workspace-data/*.nxt       # Binary cache index
.nx/workspace-data/*.hash      # Lockfile hash cache
```

**Root Cause**: `.gitignore` has `.wrangler/` but missing `.nx/`

**Fix:**
```bash
# Remove from git tracking
git rm --cached -r .nx/

# Add to .gitignore
echo "" >> .gitignore
echo "# Nx build cache and workspace data" >> .gitignore
echo ".nx/" >> .gitignore

# Commit
git add .gitignore
git commit -m "chore: remove .nx build cache from git tracking"
```

#### Issue #2: Log Files Tracked in Git
**Severity**: MEDIUM
**Files**: `test-output.log` (4K, at repo root)

**Fix:**
```bash
git rm --cached test-output.log
# Note: *.log already in .gitignore but wasn't applied retroactively
```

#### Issue #3: Personal Tool Config Tracked
**Severity**: LOW
**Files**: `.gemini/settings.json` (personal AI assistant settings)

**Discussion**: `.vscode/settings.json` is tracked (acceptable for team workspace settings), but `.gemini/` is personal preference

**Fix:**
```bash
git rm --cached -r .gemini/

# Add to .gitignore
echo "" >> .gitignore
echo "# Personal AI assistant configs" >> .gitignore
echo ".claude/        # Claude Code settings" >> .gitignore
echo ".gemini/        # Gemini settings" >> .gitignore
```

### Documentation Duplication Analysis

#### docs/ vs wiki-content/ Content Overlap

**Overlapping Topics:**

| docs/ File | wiki-content/ File | Status |
|-----------|-------------------|--------|
| `architecture.md` (16K) | `Architecture.md` (unknown) | DUPLICATE |
| `tenancy.md` (16K) | `Multi-Tenancy.md` | DUPLICATE |
| `security.md` (8K) | `Security-Best-Practices.md` | DUPLICATE |
| `testing.md` (8K) | `Testing-Guide.md` | DUPLICATE |
| N/A | `Getting-Started.md` | UNIQUE ✓ |
| N/A | `Troubleshooting.md` | UNIQUE ✓ |
| N/A | `API-Reference.md` | UNIQUE ✓ |
| N/A | `Development-Guide.md` | UNIQUE ✓ |

**Problem**: Two sources of truth → content drift is inevitable

**Recommendation**: **Keep docs/ as canonical**
- Reason 1: docs/ has ADRs, examples, m4-results (structured reference material)
- Reason 2: docs/ referenced in CLAUDE.md (`agents.prompt.yaml`)
- Reason 3: docs/ has milestone tracking integrated

**Migration Plan**:
1. Extract unique content from wiki-content/:
   - `Getting-Started.md` → merge into root `README.md` or create `docs/getting-started.md`
   - `Troubleshooting.md` → create `docs/troubleshooting.md`
   - `API-Reference.md` → create `docs/api-reference.md`
   - `Development-Guide.md` → merge into `docs/` appropriate files
2. Delete wiki-content/ directory
3. Update any references in README.md

### Milestone File Sprawl

#### Current Milestone Files in docs/ (Root Level)

**M0-M3 Historical Files** (should be archived):
```
M0-COMPLETE.md         (12K)
M1-PREP.md             (16K)
M2-PREP.md             (16K)
M3-PREP.md             (4K)
handoff-M0.md          (4K)
handoff-M1.md          (4K)
handoff-M2.md          (8K)
handoff-M3.md          (4K)
handoff-PR.md          (4K)
PR.md                  (4K)
PR-SUMMARY.md          (8K)
```
**Total**: 11 files, ~88K

**M4 Active Files** (should be consolidated):
```
M4-PREP.md                          (4K)
M4-CODEX-PLAN.md                   (16K)
M4-CODEX-PROMPTS.md                (20K)
M4-COMPLETION-ROLLUP.md            (16K)
M4-ISSUES-QUICK-REF.md             (4K)
M4-NOTES.md                        (4K)
M4-PR-SUMMARY.md                   (4K)
M4-STAGING-DEPLOYMENT.md           (20K)
M4-STAGING-VALIDATION-RESULTS.md   (8K)
M4-REPO-CLEANUP-PLAN.md (this file) (4K)
```
**Total**: 10 files, ~104K

**M5 Preview**:
```
M5-PREP.md             (20K)
```

#### Recommendation: Consolidation Strategy

**For M0-M3** (completed milestones):
```bash
mkdir -p docs/archive/milestones/M0 M1 M2 M3
git mv docs/M0-COMPLETE.md docs/archive/milestones/M0/
git mv docs/handoff-M0.md docs/archive/milestones/M0/
# ... repeat for M1, M2, M3
git mv docs/PR*.md docs/archive/milestones/
git mv docs/handoff-PR.md docs/archive/milestones/
```

**For M4** (current):
```bash
mkdir -p docs/milestones/M4
git mv docs/M4-*.md docs/milestones/M4/

# Then consolidate within M4/:
# - Combine M4-PREP + M4-CODEX-PLAN → PLAN.md
# - Combine M4-COMPLETION-ROLLUP + M4-STAGING-VALIDATION-RESULTS → STATUS.md
# - Keep M4-STAGING-DEPLOYMENT as DEPLOYMENT.md
# - Keep M4-NOTES as NOTES.md
# - Move M4-CODEX-PROMPTS to docs/tooling/
```

**Keep in docs/ root**:
- `plan.md` (28K) - master project plan
- `PROJECT-STATUS.md` (16K) - current status dashboard
- `quick-reference.md` (4K) - quick reference guide
- `agents.prompt.yaml` (16K) - agent orchestration config

### Additional Observations

#### ✅ Well-Organized Areas
- `packages/*/src/` - clean source structure, no orphaned files
- `apps/worker-api/src/` - minimal, only essential files
- `tenants/*/` - proper tenant configs with .gitignore
- Root configs (package.json, tsconfig.json, nx.json, etc.) - appropriate

#### 📂 Directory Structure Analysis
```
crispy-enigma/
├── .github/                    (1 file: copilot-instructions.md)
├── .nx/                        ⚠️ 29 files tracked (should be .gitignored)
├── .gemini/                    ⚠️ tracked (should be .gitignored)
├── .vscode/                    ✅ (workspace settings, OK to track)
├── apps/worker-api/            ✅ clean
├── archive/                    ✅ .gitignored
├── docs/                       ⚠️ needs consolidation (54 files)
│   ├── adrs/                   ✅ (4 ADRs)
│   ├── examples/               ✅ (2 examples)
│   ├── m4-results/             ✅ (3 JSON test results)
│   └── milestones/             ⚠️ only M0-M2 (incomplete)
├── packages/                   ✅ clean (5 packages, source only)
├── scripts/                    ✅ clean
├── tenants/                    ✅ clean
├── tests/                      ✅ clean
├── wiki-content/               ⚠️ duplicate docs (13 files, 176K)
└── [root configs]              ✅ appropriate
```

### Git Status at Time of Reindex
```
M  .nx/workspace-data/file-map.json      # modified build cache
M  .nx/workspace-data/nx_files.nxt       # modified build cache
?? docs/M4-REPO-CLEANUP-PLAN.md          # this file
```

### Recommended .gitignore Additions

**Complete additions to append to .gitignore:**
```gitignore
# Nx build cache and workspace data
.nx/

# Personal AI assistant configs
.claude/
.gemini/

# Test artifacts (*.log already present, but ensure no exceptions)
test-output.log
*.test.log

# Local temporary directories
.local/
temp/
tmp/
```

### Size Impact Analysis

**Current Git-Tracked Size**: ~6.6M (excluding node_modules)

**Removals**:
- .nx/ cache: ~728K
- .gemini/: ~4K
- test-output.log: ~4K
- wiki-content/: ~176K (after content merge)
**Total Reduction**: ~912K (13.8% reduction)

**Expected Git-Tracked Size After Cleanup**: ~5.7M

### Implementation Priority Matrix

| Task | Priority | Impact | Effort | Blocker For |
|------|----------|--------|--------|-------------|
| Remove .nx/ from git | P0 | High | 5 min | M4 staging |
| Remove test-output.log | P0 | Low | 2 min | Clean git status |
| Remove .gemini/ | P1 | Low | 2 min | - |
| Update .gitignore | P0 | High | 5 min | All removals |
| Consolidate wiki-content/ | P1 | Medium | 30 min | Doc clarity |
| Archive M0-M3 files | P2 | Medium | 15 min | Doc organization |
| Consolidate M4 files | P2 | Medium | 20 min | M4 closeout |

### Pre-M4 Staging Checklist

**MUST DO before staging deploy:**
- [ ] Remove .nx/ from git tracking
- [ ] Update .gitignore with comprehensive ignore patterns
- [ ] Verify `git status` shows clean working tree
- [ ] Test: `nx run-many -t test` still works
- [ ] Commit: "chore: remove build artifacts from git tracking"

**SHOULD DO before staging deploy:**
- [ ] Consolidate wiki-content/ into docs/
- [ ] Update README.md references
- [ ] Verify all docs/ cross-references resolve

**CAN DEFER to post-staging:**
- [ ] Archive M0-M3 milestone files
- [ ] Consolidate M4 files into milestones/M4/
- [ ] Create docs/README.md index

### Validation Commands

**After Phase 1 (artifact removal):**
```bash
git status                           # Should show only intended changes
ls -la .nx/                          # Should still exist (local cache)
git ls-files .nx/                    # Should return nothing
nx run-many -t test                  # Should pass
```

**After Phase 2 (docs consolidation):**
```bash
find docs/ -name "*.md" | wc -l      # Should be significantly reduced
grep -r "wiki-content/" README.md    # Should return no matches
```

**Final verification:**
```bash
git log --oneline -5                 # Review commit history
git diff HEAD~3 --stat               # Review all changes
npm test                             # Full test suite
```

## Reindex Snapshot (2026-02-07)

- Total repo size (working copy): ~353M
- Top-level size hotspots:
  - node_modules/: ~343M
  - .git/: ~6.6M
  - .nx/: ~728K (cache + workspace data, currently tracked)
  - archive/: ~736K (ignored; contains historical wrangler state)
  - docs/: ~484K
  - tenants/: ~428K
  - packages/: ~196K
  - wiki-content/: ~176K
  - tests/: ~116K
- Tracked cache/state that should be removed from git:
  - .nx/** (cache + workspace-data; git status shows modified .nx/workspace-data/file-map.json and .nx/workspace-data/nx_files.nxt)
  - tenants/mrrainbowsmoke/.wrangler/state/** (sqlite + shm/wal)
- Tracked tool configs that may be optional:
  - .gemini/settings.json
  - .vscode/settings.json
- Ignored but present locally:
  - .wrangler/tmp/
  - .claude/settings.local.json
  - test-output.log
  - archive/2026-02-07/**

## Additional Cleanup Plan (Organization + Slimming)

1) Purge tracked caches/state from index
   - Remove .nx/** and tenants/*/.wrangler/** from git history (keep locally if needed).
   - Confirm clean git status after removing from index.

2) Tighten ignore rules
   - Add .nx/, .claude/, .gemini/, and tenants/**/.wrangler/.
   - Decide whether .vscode/ is shared config or local-only; ignore if local.

3) Consolidate documentation sources
   - Pick a single canonical doc root: docs/ or wiki-content/.
   - Map duplicates (examples): docs/architecture.md vs wiki-content/Architecture.md, docs/tenancy.md vs wiki-content/Multi-Tenancy.md, docs/testing.md vs wiki-content/Testing-Guide.md, docs/security.md vs wiki-content/Security-Best-Practices.md.
   - Migrate and leave a short index/redirect note to avoid drift.

4) Rationalize milestone docs
   - Move M0–M3 materials into docs/milestones/legacy/.
   - Keep M4 items in docs/milestones/M4/ with a single index page.
   - Keep only one “current status” doc (e.g., docs/PROJECT-STATUS.md).

5) Optional: externalize archive
   - If archive/ must be preserved, move to a separate repo or release assets.

## Sequencing Update

1) Remove tracked cache/state + update ignores.
2) Consolidate docs and de-duplicate wiki content.
3) Restructure milestones and archive.

## Verification Checklist (Updated)

- git status clean after cache/state removal
- No .nx/** or tenants/**/.wrangler/** tracked
- README/doc links updated to canonical doc root
- Staging deploy references only canonical docs
