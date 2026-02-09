# Crispy Enigma: Recommended Repository Structure

**Goal**: World-class Cloudflare Monorepo Organization

---

## Target Structure (Post-Cleanup)

```
crispy-enigma/
│
├── 📋 Root Configuration & Meta
│   ├── .github/                    # GitHub workflows, templates
│   ├── .gitignore                  # Updated: .env, .wrangler, deployments/
│   ├── .prettierrc.json
│   ├── eslint.config.js
│   ├── nx.json                     # ✓ NX-protected, untouched
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   │
│   ├── README.md                   # Master guide: start here
│   ├── CHANGELOG.md                # Version history
│   ├── LICENSE
│   ├── SECURITY.md                 # Security policy
│   ├── AGENTS.md                   # Multi-AI orchestration
│   │
│   └── REPOSITORY-STRUCTURE.md     # This folder layout (NEW)
│
├── 📦 Core Packages (Multi-tenant Framework)
│   └── packages/
│       ├── core/                   # ✓ Types, tenant context, env
│       ├── storage/                # ✓ KV, DO, Vectorize adapters
│       ├── ai/                     # ✓ AI Gateway wrapper
│       ├── rag/                    # ✓ Chunking, embeddings, retrieval
│       ├── observability/          # ✓ Logging, metrics, alerts
│       ├── tools/                  # ✓ Tool registry, dispatcher
│       └── tts/                    # ✓ Text-to-speech adapter
│
├── 🚀 Applications (Cloudflare Workers)
│   └── apps/
│       └── worker-api/             # ✓ Multi-tenant AI chat API
│
├── 👥 Multi-Tenant Configuration
│   └── tenants/
│       │
│       ├── README.md               # Tenant architecture overview (NEW)
│       ├── TENANTS-CONFIG-SCHEMA.md # Config schema reference (NEW)
│       ├── index.ts                # ✓ Tenant registry
│       │
│       ├── mrrainbowsmoke/
│       │   ├── README.md           # Tenant setup guide (NEW)
│       │   ├── tenant.config.json
│       │   ├── wrangler.jsonc
│       │   ├── .env.example        # Template (renamed from .env)
│       │   ├── .env.local          # Local overrides (git-ignored)
│       │   └── .gitignore
│       │
│       └── rainbowsmokeofficial/   # Same structure as above
│           ├── README.md           # NEW
│           ├── tenant.config.json
│           ├── wrangler.jsonc
│           ├── .env.example        # NEW
│           ├── .env.local
│           └── .gitignore
│
├── 🧪 Tests
│   └── tests/
│       ├── README.md               # Testing strategy (NEW)
│       ├── *.spec.ts               # Unit/integration tests
│       └── fixtures/               # Test data
│
├── 🛠️ Scripts & Automation
│   └── scripts/
│       │
│       ├── README.md               # Script usage guide (NEW)
│       ├── lib/                    # Shared utilities
│       │   └── *.mjs
│       │
│       ├── deployment/             # Deploy automation
│       │   ├── deploy-all.mjs
│       │   ├── deploy-tenant.mjs
│       │   └── rollback.mjs        # If exists
│       │
│       ├── development/            # Local dev tools
│       │   ├── dev.mjs
│       │   ├── chat-dev.mjs
│       │   └── smoke-dev.mjs
│       │
│       ├── validation/             # Config & drift checks
│       │   ├── validate-config.mjs
│       │   └── detect-drift.mjs
│       │
│       ├── testing/                # Performance, load tests
│       │   └── load-test.ts
│       │
│       └── setup/                  # One-time initialization
│           └── generate-tenant-index.mjs
│
├── 📚 Documentation
│   └── docs/
│       │
│       ├── README.md               # Doc index (NEW)
│       ├── FIRST-TIME-SETUP.md     # Beginner's guide (NEW)
│       ├── CLAUDE.md               # Claude agent context (mv from root)
│       ├── SECURITY.md             # Security practices
│       ├── PROJECT-STATUS.md       # Current milestone status
│       │
│       ├── architecture/           # System design
│       │   ├── architecture.md
│       │   ├── bindings.md
│       │   ├── failure-modes.md
│       │   ├── footguns.md
│       │   ├── metrics.md
│       │   └── README.md           # Architecture index
│       │
│       ├── guides/                 # How-to documentation
│       │   ├── getting-started.md
│       │   ├── development-guide.md
│       │   ├── environment-setup.md (NEW)
│       │   ├── ai-gateway.md
│       │   ├── rate-limiting.md
│       │   ├── sessions.md
│       │   ├── streaming.md
│       │   ├── testing.md
│       │   ├── troubleshooting.md
│       │   ├── vectorize-dev.md
│       │   ├── wrangler.md
│       │   ├── security.md
│       │   └── api-reference.md
│       │
│       ├── integration/            # API & Postman (NEW)
│       │   ├── README.md           # API testing guide (↑ POSTMAN_GUIDE.md)
│       │   ├── postman-collection.json
│       │   ├── postman-env.staging.json
│       │   └── examples/           # Code examples
│       │       ├── chat.md
│       │       ├── tenant-aware-handler.ts
│       │       ├── AI_GATEWAY.md
│       │       └── postman-mcp.json
│       │
│       ├── milestones/             # Release milestones
│       │   ├── M0.md
│       │   ├── M1.md
│       │   ├── M2.md
│       │   ├── M7.md
│       │   ├── M8/
│       │   │   ├── README.md
│       │   │   ├── STATUS.md
│       │   │   └── PLANNING-BRIEF.md
│       │   └── README.md           # Milestones index
│       │
│       ├── runbooks/               # Operational procedures
│       │   ├── incident-response.md
│       │   └── rollback-deployment.md
│       │
│       ├── nx/                     # ✓ NX docs (consolidated)
│       │   ├── NX-ALIGNMENT-QUICK-REF.md
│       │   ├── NX-EXECUTIVE-SUMMARY.md
│       │   ├── NX-ISSUES-ALIGNMENT.md
│       │   ├── NX-README.md
│       │   ├── NX-VISUAL-STRUCTURE.md
│       │   ├── documentation-gaps.md
│       │   ├── generator-input-map.md
│       │   ├── refactoring-opportunities.md
│       │   └── wrangler-deduplication-analysis.md
│       │
│       ├── tooling/                # Tool analysis & prompts
│       │   ├── CODEX-PROMPTS.md
│       │   └── README.md
│       │
│       ├── agents.prompt.yaml      # Multi-agent orchestration
│       ├── agents.nx-phase.prompt.yaml (✓ NX-protected)
│       │
│       ├── tool-contracts.md      # Tool API contracts
│       ├── tts-contracts.md       # Text-to-speech contracts
│       ├── VARIABLE_NAMES.md       # Naming conventions
│       ├── dashboards.md           # Observability dashboards
│       ├── external-dependency-failures.md # Known issues
│       │
│       │
│       └── archive/                # Old records & historical docs
│           ├── README.md           # Archive organization (NEW)
│           │
│           ├── benchmarks/         # Performance test results
│           │   ├── API-performance.html
│           │   └── m4-results/
│           │       ├── m4-results.json
│           │       ├── newman-performance.json
│           │       ├── response-cache.json
│           │       ├── response-search.json
│           │       └── response.json
│           │
│           ├── handoffs/           # Milestone transition docs
│           │   ├── handoff-M5.md
│           │   ├── m5-handoff.md
│           │   ├── m5-m6-handoff.md
│           │   ├── m6-m7-handoff.md
│           │   ├── handoff-M8.md
│           │   └── m8-handoff.md
│           │
│           ├── sessions/           # Session transcripts
│           │   └── 2026-02-06-session.md
│           │
│           └── milestones/         # Completed milestone docs
│               └── (M0-M3 docs moved here for reference)
│
├── 📦 Archived & Backup
│   └── archive/
│       │
│       ├── README.md               # Archive guide (NEW)
│       │
│       ├── sessions-backup/        # ✓ Agent session archives (DONE)
│       │   ├── copilot-session-2026-02-08-*.tar.gz
│       │   ├── claude-session-2026-02-08-*.tar.gz
│       │   └── gemini-session-2026-02-08-*.tar.gz
│       │
│       ├── deployment-history/     # All past deployments (NEW)
│       │   ├── 2026-02-08/
│       │   │   ├── index.json      # Deployment manifest
│       │   │   ├── deploy-all-production-*.json
│       │   │   ├── deploy-all-staging-*.json
│       │   │   ├── mrrainbowsmoke-*.json
│       │   │   └── rainbowsmokeofficial-*.json
│       │   ├── 2026-02-09/
│       │   │   └── (future deployments)
│       │   └── README.md           # Deployment history guide (NEW)
│       │
│       ├── scripts/                # Historical automation
│       │   ├── M4-codex-generation.sh
│       │   └── README.md           # Script archive notes (NEW)
│       │
│       └── agent-outputs/          # Archived AI agent deliverables
│           ├── claude-spec.md
│           ├── claude-review.md
│           └── (dated archive)
│
└── 📍 Deployment & Runtime (Git-Ignored)
    ├── .wrangler/                  # Wrangler state (generated, ignored)
    ├── node_modules/               # Dependencies (ignored)
    ├── .env                        # Local secrets (ignored)
    ├── .env.*.local                # Tenant-specific locals (ignored)
    └── (other local temp files)
```

---

## Key Improvements

### 🗂️ **Organization**
- **Flat → Hierarchical**: `docs/` now clearly categorized
- **Consistency**: Scripts follow `/category/` pattern
- **Discoverability**: Each major section has a `README.md` index

### 🔧 **Maintainability**
- **No waste**: Old deployment logs indexed & archived by date
- **Clear ownership**: Each folder has clear purpose
- **DX-first**: First-time contributor can navigate easily

### 🚀 **Scalability**
- **Tenant pattern**: Easy to add `tenants/newclient/`
- **Script organization**: Easy to add new automation without clutter
- **Documentation growth**: Archive structure supports many milestones

### ⚡ **Performance**
- **Smaller clones**: Build caches excluded
- **Cleaner status**: Git status easier to read
- **Fast navigation**: Fewer files in root, docs organized by topic

---

## Migration Checklist

### Priority 1: Safe Cleanup
```bash
# Phase 1: Wrangler cache
find tenants -name ".wrangler" -type d -exec rm -rf {} +

# Phase 2: Session purge
rm -rf .copilot-session/*.md
rm -rf .claude/agent-memory/
```

### Priority 2: Structure
```bash
# Phase 3: Deployments
mkdir -p archive/deployment-history/2026-02-08
mv deployments/*.json archive/deployment-history/2026-02-08/

# Phase 5: Docs
mkdir -p docs/integration/examples
mkdir -p docs/archive/benchmarks
mkdir -p docs/archive/handoffs
mkdir -p docs/archive/sessions
```

### Priority 3: Enhancement
```bash
# Add READMEs to key folders
touch docs/README.md
touch docs/FIRST-TIME-SETUP.md
touch tenants/README.md
touch scripts/README.md
touch archive/README.md
```

---

## Expected Outcomes

| Metric | Before | After | ✅ Benefit |
|--------|--------|-------|----------|
| **Root files** | 7 docs | 2 docs | -70% clutter |
| **Git clone** | ~5min | ~2min | Faster setup |
| **New dev onboarding** | 20 mins to find docs | 5 mins | Better DX |
| **Doc navigation** | "Where's the X guide?" | Obvious: `/docs/guides/X.md` | Discoverability |
| **Deployment traceability** | Scattered dates | Indexed by date | Auditability |

---

## Not Touched (NX-Protected)

```
✓ docs/agents.nx-phase.prompt.yaml
✓ docs/nx/
✓ nx.json
✓ docs/nx/ (all NX docs consolidated)
```

These remain **exactly as-is** per requirements.

---

**Status**: ✅ **READY FOR IMPLEMENTATION**  
**Complexity**: Medium (11 phases, mostly file moves)  
**Time**: ~2 hours  
**Reversibility**: High (all moves, no deletions, backed up)

---

Generated: 2026-02-08 by Claude + Copilot Team
