# Gemini Refactoring & Architecture Analysis Guide

**Sub-Agent Role**: QA Engineer + Refactoring Specialist  
**Scope**: Parallel analysis during repo cleanup  
**Mode**: Gemini Pro 3.5 with `--yolo` flags enabled  
**Focus**: Architecture, testing, code quality improvements

---

## Mission

While Claude, Copilot, and the team execute the structural cleanup, **Gemini analyzes** the codebase to identify:
1. **Refactoring opportunities** (code quality, patterns)
2. **Architectural improvements** (structure, dependencies)
3. **Testing gaps** (coverage, strategy)
4. **Best practices** alignment (Cloudflare, multi-tenant patterns)

**Goal**: By the time cleanup finishes, have a refactoring roadmap ready for next phase.

---

## Gemini's Parallel Tasks

### Phase A: Repository Analysis (Concurrent with Cleanup Phases 1-2)

**Analyze These Packages**:
```
packages/
├── core/        → Type consistency, tenant isolation patterns
├── storage/     → Adapter patterns, KV/DO/Vectorize usage
├── ai/          → Gateway wrapper design, error handling
├── rag/         → Chunking strategies, retrieval optimization
├── observability/ → Logging patterns, metric structure
├── tools/       → Tool registry, dispatcher design
└── tts/         → Adapter consistency with others
```

**Deliverable**: `docs/archive/analysis/REFACTORING-OPPORTUNITIES.md`

```markdown
# Refactoring Opportunities

## High Priority
1. **Storage adapters**: Consolidate KV pattern (see lines X-Y patterns differ)
2. **Error handling**: Standardize across packages (no custom Error classes)
3. **Logging**: Apply ObservabilityContext consistently in all packages

## Medium Priority
4. **Type exports**: Barrel exports (*-index.ts) inconsistently typed
5. **Test structure**: Some packages lack __tests__, others use different patterns

## Low Priority
6. **Documentation**: JSDoc coverage varies (80%-40% across packages)
```

---

### Phase B: Test Coverage Analysis (Concurrent with Cleanup Phases 3-5)

**Analyze**:
```
tests/
├── *.spec.ts files
├── Test patterns (vitest, setup, fixtures)
├── Coverage gaps by package
└── Integration test strategy
```

**Tasks**:
- [ ] Generate coverage report
- [ ] Identify untested critical paths (tenant resolution, storage ops)
- [ ] Create test strategy recommendation

**Deliverable**: `docs/archive/analysis/TEST-COVERAGE-REPORT.md`

```markdown
# Test Coverage Analysis

## By Package
- core/: 92% (✓ Good)
- storage/: 67% (⚠️ Missing DO tests)
- ai/: 45% (❌ Critical gap: fallback logic untested)
- rag/: 78% (⚠️ Vectorize mock inadequate)

## Recommendations
1. Add E2E tests for multi-tenant chat flow
2. Mock Cloudflare bindings consistently
3. Add chaos test for AI gateway failures
```

---

### Phase C: Architecture Review (Concurrent with Cleanup Phases 6-8)

**Focus Areas**:

#### 1. **Tenant Isolation**
Verify all code paths enforce tenant context:
```typescript
// ✅ GOOD: Explicit tenant parameter
function getSession(tenantId: string, sessionId: string, env: Env)

// ❌ BAD: Tenant hidden in closure/context
const adapter = createAdapter(tenantId);
adapter.getSession(sessionId);  // Where's tenantId enforced?
```

**Check**:
- [ ] All storage operations include `tenantId`
- [ ] KV keys prefixed with `${tenantId}:`
- [ ] DO IDs encode tenant: `env.DO.idFromName(\`${tenantId}:${id}\`)`
- [ ] No global state without tenant context

**Deliverable**: `docs/archive/analysis/TENANT-ISOLATION-AUDIT.md`

#### 2. **Type Safety**
Review `packages/core/src/env.ts` and ensure all packages match:
```typescript
// In packages/core/env.ts
export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  // ... etc
}

// Verify all packages use this Env type consistently
```

**Check**:
- [ ] Type imports from `@repo/core`
- [ ] No `any` types in critical paths
- [ ] Zod schemas for runtime validation

**Deliverable**: `docs/archive/analysis/TYPE-SAFETY-AUDIT.md`

#### 3. **Error Handling**
Analyze error patterns:
```typescript
// Check for consistent error shapes
if (error instanceof ZodError) { ... }
if (error instanceof CloudflareError) { ... }
```

**Check**:
- [ ] Error types defined consistently
- [ ] User-facing errors sanitized (no stack traces)
- [ ] Logging includes context (tenantId, sessionId, trace)

**Deliverable**: `docs/archive/analysis/ERROR-HANDLING-PATTERNS.md`

---

### Phase D: Best Practices Alignment (Concurrent with Cleanup Phases 9-11)

**Cloudflare Patterns**:
- [ ] Workers AI usage routed via gateway (never direct)
- [ ] Vectorize queries include namespace/tenant filters
- [ ] D1 queries parameterized (no SQL injection)
- [ ] Rate limiting enforced pre-request

**Multi-Tenant Patterns**:
- [ ] Request context includes tenant validation
- [ ] Storage operations check tenant match (soft validation)
- [ ] Metrics/logs tagged with `tenantId`
- [ ] Feature flags respect tenant config

**Deliverable**: `docs/archive/analysis/BEST-PRACTICES-ALIGNMENT.md`

---

## Analysis Template: Refactoring Opportunity

```markdown
### Title: [Concise Name]

**Severity**: 🔴 Critical | 🟡 Medium | 🟢 Low

**Location**: 
- File: `packages/storage/src/kv.ts` (lines 45-67)
- Related: `packages/core/src/env.ts`

**Current Pattern**:
\`\`\`typescript
// Current implementation (problematic)
\`\`\`

**Issue**:
- What's wrong: semantic explanation
- Why it matters: impact on type safety / maintainability / performance
- Risk: what breaks if not fixed

**Recommended Pattern**:
\`\`\`typescript
// Proposed implementation
\`\`\`

**Benefit**:
- Consistency across X packages
- Reduces cognitive load
- Improves testability

**Effort**: 2 hours | 1 day | 1 week

**Blockers**: (None | Depends on X PR | Needs design review)

**Test Coverage**: (Current 45% → Target 85%)
```

---

## Analysis Output Structure

Create these in `docs/archive/analysis/`:

```
docs/archive/analysis/
├── README.md                           # Index of all analyses
├── REFACTORING-OPPORTUNITIES.md        # Code quality improvements
├── TEST-COVERAGE-REPORT.md             # Testing strategy gaps
├── TENANT-ISOLATION-AUDIT.md           # Security/architecture review
├── TYPE-SAFETY-AUDIT.md                # Type system consistency
├── ERROR-HANDLING-PATTERNS.md          # Error model review
├── BEST-PRACTICES-ALIGNMENT.md         # Cloudflare/multi-tenant patterns
└── ARCHITECTURE-SCORE.md               # Overall health metrics
```

---

## Metrics to Track

Create a scorecard in `docs/archive/analysis/ARCHITECTURE-SCORE.md`:

```markdown
# Architecture Health Scorecard

## Type Safety
- Overall: 92%
  - core/: 95%
  - storage/: 88%
  - ai/: 85%
  - rag/: 90%

## Test Coverage
- Overall: 74%
  - Target: 85%
  - Critical paths: 89% ✓
  - Edge cases: 62% ⚠️

## Tenant Isolation
- Tenant leaks: 0 ✓
- Hidden context: 2 occurrences ⚠️
- KV key validation: 94%

## Error Handling
- Sanitized user errors: 100% ✓
- Consistent error types: 87%
- Logging completeness: 81%

## Best Practices
- Cloudflare patterns: 91% ✓
- Multi-tenant patterns: 88% ✓
- Code duplication: 5.2% (acceptable)

---

## Recommendations (Priority Order)
1. [Refactoring A] - High impact, 2 hours
2. [Refactoring B] - Medium impact, 1 day
3. [Refactoring C] - Low impact, nice-to-have
```

---

## How Gemini Executes

### Command Line
```bash
# Analyze packages for patterns
gemini analyze-repo \
  --path=/home/dfox/projects-cf/crispy-enigma \
  --focus=architecture,testing,patterns \
  --yolo \
  --output=docs/archive/analysis/

# OR: Run analysis by phase
gemini analyze \
  --phase="packages/core" \
  --checklist=tenant-isolation,type-safety,error-handling \
  --report=detailed \
  --yolo
```

### Deliverables Checklist

**By End of Cleanup** (80 minutes):

- [ ] **REFACTORING-OPPORTUNITIES.md** (High/Medium/Low)
- [ ] **TEST-COVERAGE-REPORT.md** (% by package)
- [ ] **TENANT-ISOLATION-AUDIT.md** (Security check)
- [ ] **TYPE-SAFETY-AUDIT.md** (Consistency review)
- [ ] **ERROR-HANDLING-PATTERNS.md** (Error model)
- [ ] **BEST-PRACTICES-ALIGNMENT.md** (Cloudflare/multi-tenant)
- [ ] **ARCHITECTURE-SCORE.md** (Overall health metrics)

---

## Integration with Cleanup Phases

| Cleanup Phase | Gemini Parallel Work |
|---------------|---------------------|
| 1-2 (Cache, Sessions) | Start repo analysis |
| 3-5 (Deployments, Docs) | Test coverage audit |
| 6-8 (Root docs, Scripts) | Architecture review |
| 9-11 (Tenant, READMEs) | Best practices alignment |
| **Complete** | Deliver refactoring roadmap |

---

## Refactoring Roadmap (Output After Cleanup)

Once cleanup finishes, Gemini provides a prioritized roadmap:

```markdown
# Refactoring Roadmap (Post-Cleanup)

## Phase 1: Critical (1 week)
- [ ] Fix AI gateway fallback test gaps
- [ ] Standardize error handling across packages
- [ ] Add missing tenant isolation checks

## Phase 2: Medium (2 weeks)
- [ ] Consolidate storage adapter patterns
- [ ] Improve observability logging consistency
- [ ] Add E2E tests for chat flow

## Phase 3: Nice-to-Have (Next sprint)
- [ ] Improve JSDoc coverage
- [ ] Optimize type exports
- [ ] Add performance benchmarks

---

## Effort Estimate
- Phase 1: ~20 developer-hours
- Phase 2: ~30 developer-hours
- Phase 3: ~15 developer-hours
```

---

## Tools & Commands for Gemini

### Analyze Specific Package
```bash
gemini analyze --package=storage --depth=deep --yolo
```

### Find Code Patterns
```bash
gemini search-pattern "function.*tenantId.*(" --check=required-param
```

### Generate Test Gap Report
```bash
gemini coverage --threshold=85% --output=json
```

### Type Consistency Check
```bash
gemini typecheck --package=all --strict --report=detailed
```

---

## Success Criteria

✅ **Gemini's work is done when**:

1. All 7 analysis documents completed
2. Architecture Score reflects baseline (starting point)
3. Refactoring Roadmap is prioritized & estimated
4. No critical tenant isolation issues found
5. Test coverage gaps identified with recommended fixes
6. Best practices alignment scores documented
7. All findings are actionable (not vague)

---

## Integration with PR #240

The current active PR is aligned with NX-1 through NX-4 sub-issues. Gemini's analysis feeds into:

1. **NX-1 (Bootstrap)**: Validate test harness recommendations
2. **NX-2-4 (Generators)**: Ensure generated code follows best practices
3. **Architecture Review**: Claude uses Gemini's audit for design decisions
4. **Future Refactoring**: Codex references Gemini's roadmap for next PRs

---

## Example: One Refactoring Opportunity

### Title: Consolidate KV Prefix Pattern

**Severity**: 🟡 Medium

**Location**:
- `packages/storage/src/kv.ts` (lines 12-35)
- `packages/storage/src/search-cache.ts` (lines 45-60)
- Also in: `packages/tools/src/registry.ts`

**Current Pattern**:
```typescript
// In kv.ts
const key = `${tenantId}:${resource}`;

// In search-cache.ts
const key = `cache:${tenantId}:${searchQuery}`;

// In registry.ts
const key = `registry_${tenantId}_${toolId}`;

// INCONSISTENT: Different separators & ordering
```

**Issue**:
- No standard KV key format across packages
- Makes debugging harder (which format was used?)
- Risk of collision (search-cache could match registry if query == "registry_X_Y")

**Recommended Pattern**:
```typescript
// Standardize: `${namespace}:${tenantId}:${resource}`
const key = `kv:${tenantId}:${resource}`;
const searchCacheKey = `search-cache:${tenantId}:${query}`;
const registryKey = `tool-registry:${tenantId}:${toolId}`;
```

**Benefit**:
- Consistent across all code
- Easy to parse/debug (regex: `^(\\w+):${tenantId}:(.+)$`)
- Reduces accidental collisions

**Effort**: 2 hours

**Test Coverage**: Currently 67% → Target 85% (add namespace validation tests)

---

## Notes

- Gemini runs **in parallel** with cleanup execution (not sequential)
- All findings go to `docs/archive/analysis/` (not blocking cleanup)
- Refactoring roadmap is for **next milestone**, not immediate
- NX items: Gemini analyzes like any other code (NX protection applies to planning, not analysis)

---

**Status**: ✅ Ready for Gemini to execute  
**Mode**: Gemini Pro 3.5 + `--yolo` flags  
**Outputs**: 7 analysis documents + refactoring roadmap  
**Timeline**: Parallel with 80-minute cleanup

---

_Prepared for: Gemini Sub-Agent (QA + Refactoring)_  
_Stakeholders: Claude (Architecture), Copilot (DX), Team (Implementation)_
