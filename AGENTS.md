<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.

<!-- nx configuration end-->
# agents.nx-phase.prompt.yaml
# Orchestrates Claude, Codex, Gemini, and Copilot for Phase NX (Nx Plugin Development)
# 4 parallel AI agents with sub-agents, working across NX-1 through NX-4
#
# Agent roles (carried over from agents.prompt.yaml, specialized for NX):
#   Claude  = Architect — specs, schemas, interfaces, type contracts, ADRs
#   Codex   = Builder   — implementation, generators, executors, runtime code
#   Gemini  = QA        — testing, validation, CI gates, quality assurance
#   Copilot = DX        — templates, docs, error messages, polish, examples
#
# Execution topology:
#   NX-1 (sequential, foundation)
#     ├── NX-2 (parallel branch: worker generator)
#     ├── NX-3 (parallel branch: tenant generator)
#     └── NX-4 (depends on NX-2 + NX-3: bindings & deploy)

version: "2.0"
phase: "NX"
title: "Nx Plugin Development for Multi-Tenant Cloudflare Workers"

# ─────────────────────────────────────────────────────────────────
# AGENTS
# ─────────────────────────────────────────────────────────────────

agents:
  - id: claude
    name: "Claude"
    role: "Architect"
    color: "#7C3AED"
    capabilities:
      - "Define schemas, interfaces, type contracts"
      - "Write ADRs and spec documents"
      - "Design generator/executor option schemas"
      - "Identify risks, constraints, and validation rules"
      - "Review cross-cutting concerns (tenant isolation, env typing)"
    subagents:
      - id: claude-spec
        role: "Schema & spec writer"
        prompt: |
          You define Nx generator/executor schemas, TypeScript interfaces, and API contracts.
          Validate against @nx/devkit API and Cloudflare wrangler schema.
          Output Zod schemas where runtime validation is needed.
      - id: claude-review
        role: "Architecture reviewer"
        prompt: |
          Review generated code for architectural correctness:
          tenant isolation, binding safety, type consistency with packages/core/src/env.ts.
          Flag any cross-tenant data leaks or binding mismatches.

  - id: codex
    name: "Codex"
    role: "Builder"
    color: "#10B981"
    capabilities:
      - "Implement Nx generators and executors"
      - "Scaffold package structure and templates"
      - "Write runtime utility code"
      - "Wire bindings and configuration"
    subagents:
      - id: codex-gen
        role: "Generator implementer"
        prompt: |
          Implement Nx generators using @nx/devkit Tree API.
          Use generateFiles() for templates, updateJson()/updateProjectConfiguration() for config.
          Follow existing patterns in the monorepo (vitest, ESM, wrangler.jsonc).
      - id: codex-exec
        role: "Executor implementer"
        prompt: |
          Implement Nx executors that wrap wrangler CLI commands.
          Handle tenant discovery, config resolution, and environment mapping.
          Reuse existing scripts/deploy-tenant.mjs patterns where possible.

  - id: gemini
    name: "Gemini"
    role: "QA"
    color: "#F59E0B"
    capabilities:
      - "Write unit/integration/snapshot tests"
      - "Design test fixtures and harnesses"
      - "Validate generated output correctness"
      - "Set up CI quality gates"
    subagents:
      - id: gemini-unit
        role: "Unit test writer"
        prompt: |
          Write vitest tests for Nx generators/executors.
          Use createTreeWithEmptyWorkspace() from @nx/devkit/testing.
          Test file generation, config updates, schema validation.
          Assert generated files match expected structure.
      - id: gemini-integration
        role: "Integration test writer"
        prompt: |
          Write integration tests that validate full generator workflows:
          init → scaffold worker → add tenant → add bindings → deploy.
          Use real file system where needed. Validate wrangler.jsonc is parseable.

  - id: copilot
    name: "Copilot"
    role: "DX"
    color: "#3B82F6"
    capabilities:
      - "Improve template quality and readability"
      - "Write developer documentation and examples"
      - "Add error messages and user-friendly output"
      - "Polish generator prompts and defaults"
    subagents:
      - id: copilot-template
        role: "Template polisher"
        prompt: |
          Review and improve generator templates for readability.
          Add inline JSONC comments explaining each binding.
          Ensure generated code follows project conventions (ESM, strict TS).
      - id: copilot-docs
        role: "Documentation writer"
        prompt: |
          Write usage docs for each generator/executor.
          Include CLI examples: nx g @crispy/nx-cloudflare:init, nx g @crispy/nx-cloudflare:worker, etc.
          Add troubleshooting sections for common errors.

# ─────────────────────────────────────────────────────────────────
# SHARED CONTEXT (all agents receive this)
# ─────────────────────────────────────────────────────────────────

shared_context:
  env_type_source: "packages/core/src/env.ts"
  tenant_config_schema: "scripts/validate-config.mjs"
  existing_tenants:
    - "tenants/mrrainbowsmoke/"
    - "tenants/rainbowsmokeofficial/"
  wrangler_template: "tenants/mrrainbowsmoke/wrangler.jsonc"
  deploy_scripts:
    - "scripts/deploy-tenant.mjs"
    - "scripts/deploy-all.mjs"
    - "scripts/validate-config.mjs"
  required_bindings:
    kv: ["RATE_LIMITER", "CONFIG", "CACHE"]
    d1: ["DB"]
    vectorize: ["VECTORIZE"]
    ai: ["AI"]
    durable_objects: ["RATE_LIMITER_DO", "CHAT_SESSION"]
  env_aliases:
    dev: ["dev", "develop", "development"]
    staging: ["stg", "staging", "preview"]
    production: ["prd", "prod", "production"]
  plugin_package: "packages/nx-cloudflare"
  plugin_scope: "@crispy/nx-cloudflare"

# ─────────────────────────────────────────────────────────────────
# PHASES — NX-1 through NX-4
# ─────────────────────────────────────────────────────────────────

phases:
  # ═══════════════════════════════════════════════════════════════
  # NX-1: BOOTSTRAP (Foundation — must complete before NX-2/NX-3)
  # ═══════════════════════════════════════════════════════════════
  - id: NX-1
    name: "Plugin Bootstrap"
    milestone: "NX-1: Bootstrap"
    depends_on: []
    status: "pending"
    description: |
      Create the Nx plugin package skeleton, shared utilities, init generator,
      and testing infrastructure. This is the foundation for all subsequent phases.

    exit_criteria:
      - "packages/nx-cloudflare exists with valid package.json, generators.json, executors.json"
      - "Init generator creates baseline workspace config"
      - "Shared utilities: parseTenantConfig, updateJsonc, validateConfig all exported and tested"
      - "Plugin test harness operational with vitest + @nx/devkit/testing"
      - "All NX-1 tests pass: nx run nx-cloudflare:test"

    issues:
      # ── #41: Create Nx plugin package skeleton ──────────────
      - parent: 41
        title: "[NX-1] Create Nx plugin package skeleton (packages/nx-cloudflare)"
        sub_issues:
          - id: "41-A"
            agent: claude
            subagent: claude-spec
            title: "Define plugin package structure and entry point schemas"
            description: |
              Design the packages/nx-cloudflare directory structure:
              - generators.json schema (init, worker, tenant, binding)
              - executors.json schema (dev, deploy, deploy-all)
              - package.json with @nx/devkit peer dependency
              - TypeScript config extending monorepo base
              Output: docs/nx-plugin/package-spec.md with directory tree and JSON schemas.
            deliverables:
              - "docs/nx-plugin/package-spec.md"
            acceptance:
              - "All generator/executor names defined with schema file paths"
              - "Dependency versions pinned to workspace versions"

          - id: "41-B"
            agent: codex
            subagent: codex-gen
            title: "Scaffold packages/nx-cloudflare directory"
            description: |
              Create the plugin package:
              - packages/nx-cloudflare/package.json (name: @crispy/nx-cloudflare)
              - packages/nx-cloudflare/tsconfig.json
              - packages/nx-cloudflare/tsconfig.spec.json
              - packages/nx-cloudflare/project.json (with build/test/lint targets)
              - packages/nx-cloudflare/generators.json (empty generators list)
              - packages/nx-cloudflare/executors.json (empty executors list)
              - packages/nx-cloudflare/src/index.ts (barrel export)
              Follow existing package patterns (packages/core, packages/tools).
            deliverables:
              - "packages/nx-cloudflare/ (full directory)"
            depends_on: ["41-A"]
            acceptance:
              - "nx run nx-cloudflare:build compiles without errors"
              - "Package exports are resolvable"

          - id: "41-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Validate plugin package structure"
            description: |
              Write validation tests:
              - generators.json is valid and parseable
              - executors.json is valid and parseable
              - package.json has correct @nx/devkit dependency
              - Project is registered in Nx workspace graph
            deliverables:
              - "packages/nx-cloudflare/src/__tests__/package-structure.spec.ts"
            depends_on: ["41-B"]
            acceptance:
              - "All structure validation tests pass"

          - id: "41-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add plugin README and developer setup"
            description: |
              Create packages/nx-cloudflare/README.md with:
              - Plugin purpose and capabilities
              - Quick start: nx g @crispy/nx-cloudflare:init
              - Available generators and executors table
              - Local development setup for plugin contributors
            deliverables:
              - "packages/nx-cloudflare/README.md"
            depends_on: ["41-B"]
            acceptance:
              - "README includes all generator/executor names"
              - "Setup instructions are runnable"

      # ── #40: Implement init generator ───────────────────────
      - parent: 40
        title: "[NX-1] Implement init generator"
        sub_issues:
          - id: "40-A"
            agent: claude
            subagent: claude-spec
            title: "Define init generator schema and behavior"
            description: |
              Define the init generator:
              - Schema options: defaultTenant (string), environments (string[], default dev/stg/prod)
              - Behavior: add nx-cloudflare plugin to nx.json, create tenants/ if missing,
                set up default workspace targets (validate, deploy, deploy-all)
              - Idempotency: safe to re-run without duplicating config
              Output: JSON schema file + behavior spec.
            deliverables:
              - "packages/nx-cloudflare/src/generators/init/schema.json"
              - "packages/nx-cloudflare/src/generators/init/schema.d.ts"
            acceptance:
              - "Schema covers all init options with defaults"
              - "Idempotency requirements documented"

          - id: "40-B"
            agent: codex
            subagent: codex-gen
            title: "Implement init generator logic"
            description: |
              Implement the init generator:
              - packages/nx-cloudflare/src/generators/init/generator.ts
              - Register plugin in nx.json plugins array
              - Create tenants/ directory if not present
              - Add workspace-level targets (validate-all, deploy-all)
              - Use @nx/devkit: Tree, updateJson, generateFiles
              Wire into generators.json.
            deliverables:
              - "packages/nx-cloudflare/src/generators/init/generator.ts"
              - "packages/nx-cloudflare/src/generators/init/files/ (template dir)"
            depends_on: ["40-A"]
            acceptance:
              - "Running init generator produces valid nx.json changes"
              - "Generator is idempotent"

          - id: "40-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write init generator tests"
            description: |
              Test the init generator:
              - Creates expected workspace structure
              - Updates nx.json correctly
              - Is idempotent (second run doesn't break anything)
              - Handles existing tenants/ directory gracefully
              Use createTreeWithEmptyWorkspace() for isolated tests.
            deliverables:
              - "packages/nx-cloudflare/src/generators/init/__tests__/generator.spec.ts"
            depends_on: ["40-B"]
            acceptance:
              - "All init generator tests pass"
              - "Idempotency test included"

          - id: "40-D"
            agent: copilot
            subagent: copilot-template
            title: "Polish init generator output and prompts"
            description: |
              Improve the init generator UX:
              - Add descriptive console output during generation
              - Add post-generation instructions (next steps)
              - Ensure generated comments explain purpose
              - Add --dry-run summary output
            deliverables:
              - "Refined generator output messages"
            depends_on: ["40-B"]
            acceptance:
              - "Init output includes clear next-steps instructions"

      # ── #39: Parse tenant config utility ────────────────────
      - parent: 39
        title: "[NX-1] Add shared utilities: parse tenant config"
        sub_issues:
          - id: "39-A"
            agent: claude
            subagent: claude-spec
            title: "Define parseTenantConfig API and TenantConfig type"
            description: |
              Define the utility interface:
              - Input: file path or Tree + path
              - Output: validated TenantConfig object (matching existing Zod schema from scripts/validate-config.mjs)
              - Errors: typed parse errors with field-level detail
              - Must support both runtime (file system) and generator (Tree) contexts
              Reuse the Zod schema from scripts/validate-config.mjs lines 12-39.
            deliverables:
              - "packages/nx-cloudflare/src/utils/tenant-config.types.ts"
            acceptance:
              - "TenantConfig type matches existing tenant.config.json structure"
              - "Error types are enumerated"

          - id: "39-B"
            agent: codex
            subagent: codex-gen
            title: "Implement parseTenantConfig utility"
            description: |
              Implement in packages/nx-cloudflare/src/utils/parse-tenant-config.ts:
              - parseTenantConfig(tree: Tree, path: string): TenantConfig
              - parseTenantConfigFromFile(filePath: string): TenantConfig
              - Use Zod for validation (reuse schema from scripts/validate-config.mjs)
              - Return typed errors with field path information
              Export from packages/nx-cloudflare/src/utils/index.ts barrel.
            deliverables:
              - "packages/nx-cloudflare/src/utils/parse-tenant-config.ts"
            depends_on: ["39-A"]
            acceptance:
              - "Parses existing tenants/mrrainbowsmoke/tenant.config.json correctly"
              - "Rejects invalid configs with descriptive errors"

          - id: "39-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write parseTenantConfig tests"
            description: |
              Test cases:
              - Valid config parses correctly
              - Missing required fields produce field-path errors
              - Extra fields are ignored (no strict mode)
              - Defaults applied for optional fields
              - Empty/null input handled gracefully
              Use real tenant.config.json fixtures from tenants/*.
            deliverables:
              - "packages/nx-cloudflare/src/utils/__tests__/parse-tenant-config.spec.ts"
            depends_on: ["39-B"]
            acceptance:
              - "100% branch coverage on parser"
              - "Edge cases tested"

          - id: "39-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add parse utility JSDoc and error messages"
            description: |
              Polish the parser utility:
              - Add JSDoc with usage examples
              - Improve error messages to suggest fixes (e.g., "Missing tenantId — add it to tenant.config.json")
              - Add inline code comments for non-obvious validation rules
            deliverables:
              - "Refined error messages and JSDoc"
            depends_on: ["39-B"]
            acceptance:
              - "Every error message suggests a fix"

      # ── #38: JSONC update utility ───────────────────────────
      - parent: 38
        title: "[NX-1] Add shared utilities: update JSONC (use jsonc-parser)"
        sub_issues:
          - id: "38-A"
            agent: claude
            subagent: claude-spec
            title: "Define JSONC utility API surface"
            description: |
              Define the JSONC utility interface:
              - readJsonc(tree: Tree, path: string): object
              - updateJsonc(tree: Tree, path: string, updater: (obj) => obj): void
              - Must preserve comments and formatting (jsonc-parser library)
              - Must handle nested paths (e.g., update env.dev.vars.MODEL_ID)
              Codex note: avoid ad-hoc string edits; use jsonc-parser's modify() API.
            deliverables:
              - "packages/nx-cloudflare/src/utils/jsonc.types.ts"
            acceptance:
              - "API handles read, update, and nested path operations"
              - "Comment preservation is a hard requirement"

          - id: "38-B"
            agent: codex
            subagent: codex-gen
            title: "Implement JSONC utilities with jsonc-parser"
            description: |
              Implement in packages/nx-cloudflare/src/utils/jsonc.ts:
              - readJsonc(): parse JSONC preserving comments
              - updateJsonc(): modify JSON values using jsonc-parser modify()
              - Add jsonc-parser to package.json dependencies
              - Handle edge cases: empty files, malformed JSONC, BOM
              Export from utils/index.ts barrel.
            deliverables:
              - "packages/nx-cloudflare/src/utils/jsonc.ts"
            depends_on: ["38-A"]
            acceptance:
              - "Comments preserved after update"
              - "Handles wrangler.jsonc from existing tenants"

          - id: "38-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write JSONC utility tests"
            description: |
              Test cases:
              - Read JSONC with comments → object
              - Update value → comments preserved
              - Nested path update works
              - Malformed JSONC produces clear error
              - Empty file handled
              Use real wrangler.jsonc as test fixture.
            deliverables:
              - "packages/nx-cloudflare/src/utils/__tests__/jsonc.spec.ts"
            depends_on: ["38-B"]
            acceptance:
              - "Comment preservation proven by test"
              - "Real wrangler.jsonc fixture used"

          - id: "38-D"
            agent: copilot
            subagent: copilot-template
            title: "Add JSONC error handling and defensive coding"
            description: |
              Improve JSONC utilities:
              - Descriptive error messages for malformed JSONC
              - Add logging for JSONC operations (debug level)
              - Ensure atomicity: failed updates don't corrupt file
            deliverables:
              - "Refined error handling in jsonc.ts"
            depends_on: ["38-B"]
            acceptance:
              - "Malformed JSONC produces actionable error message"

      # ── #37: Validate config utility ────────────────────────
      - parent: 37
        title: "[NX-1] Add shared utilities: validate config"
        sub_issues:
          - id: "37-A"
            agent: claude
            subagent: claude-spec
            title: "Define config validation rules and error format"
            description: |
              Define validation rules for:
              - tenant.config.json: Zod schema (reuse from scripts/validate-config.mjs)
              - wrangler.jsonc: required bindings, account_id match, env structure
              - Cross-file: accountId in tenant config matches wrangler account_id
              Define error format: { file, field, rule, message, suggestion }.
            deliverables:
              - "packages/nx-cloudflare/src/utils/validation.types.ts"
            acceptance:
              - "All existing validation rules from scripts/validate-config.mjs captured"
              - "Error format includes suggestion field"

          - id: "37-B"
            agent: codex
            subagent: codex-gen
            title: "Implement config validator"
            description: |
              Implement in packages/nx-cloudflare/src/utils/validate-config.ts:
              - validateTenantConfig(config: unknown): ValidationResult
              - validateWranglerConfig(tree: Tree, path: string): ValidationResult
              - validateConsistency(tenantConfig, wranglerConfig): ValidationResult
              Reuse Zod schemas. Check required bindings: RATE_LIMITER, CONFIG, CACHE (KV),
              DB (D1), VECTORIZE, AI, RATE_LIMITER_DO, CHAT_SESSION (DO).
            deliverables:
              - "packages/nx-cloudflare/src/utils/validate-config.ts"
            depends_on: ["37-A"]
            acceptance:
              - "Validates existing tenant configs without false positives"
              - "Missing binding detected and reported"

          - id: "37-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write config validation tests"
            description: |
              Test cases:
              - Valid tenant + wrangler configs pass
              - Missing required binding detected per type (KV, DO, D1, AI, Vectorize)
              - Account ID mismatch flagged
              - Invalid tenant config field rejected with field path
              - All existing tenants validate cleanly
            deliverables:
              - "packages/nx-cloudflare/src/utils/__tests__/validate-config.spec.ts"
            depends_on: ["37-B"]
            acceptance:
              - "Every required binding type has a missing-binding test"
              - "Cross-file consistency tested"

          - id: "37-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add human-readable validation error messages"
            description: |
              Improve validation output:
              - Each error includes a fix suggestion
              - Group errors by file for readability
              - Add severity levels (error vs warning)
              - Format output for terminal readability
            deliverables:
              - "Refined validation error messages"
            depends_on: ["37-B"]
            acceptance:
              - "Validation output is readable in terminal"
              - "Every error has a suggestion"

      # ── #36: Plugin testing infrastructure ──────────────────
      - parent: 36
        title: "[NX-1] Set up plugin testing infrastructure"
        sub_issues:
          - id: "36-Q1"
            agent: gemini
            subagent: gemini-unit
            title: "Design and implement plugin test harness"
            description: |
              Set up testing infrastructure for packages/nx-cloudflare:
              - vitest.config.ts for the plugin package
              - Test helpers: createTestTree() wrapping createTreeWithEmptyWorkspace()
              - Fixture helpers: addTenantToTree(), addWorkerToTree()
              - Snapshot testing utilities for generated files
            deliverables:
              - "packages/nx-cloudflare/vitest.config.ts"
              - "packages/nx-cloudflare/src/testing/helpers.ts"
            acceptance:
              - "Test harness creates isolated workspace trees"
              - "Fixtures match real tenant structure"

          - id: "36-B"
            agent: codex
            subagent: codex-gen
            title: "Wire vitest config and test scripts"
            description: |
              Configure testing:
              - Add test target to packages/nx-cloudflare/project.json
              - Configure vitest with correct TypeScript paths
              - Add test script to package.json
              - Ensure nx run nx-cloudflare:test works
            deliverables:
              - "packages/nx-cloudflare/project.json (test target)"
              - "packages/nx-cloudflare/vitest.config.ts"
            acceptance:
              - "nx run nx-cloudflare:test executes successfully"

          - id: "36-Q2"
            agent: gemini
            subagent: gemini-integration
            title: "Create test fixtures from existing tenants"
            description: |
              Create fixture data from real tenant configs:
              - Copy/sanitize tenants/mrrainbowsmoke/tenant.config.json as fixture
              - Copy/sanitize tenants/mrrainbowsmoke/wrangler.jsonc as fixture
              - Create minimal invalid config fixtures for error path testing
              - Store in packages/nx-cloudflare/src/testing/fixtures/
            deliverables:
              - "packages/nx-cloudflare/src/testing/fixtures/"
            acceptance:
              - "Fixtures match real configs structurally"
              - "Sensitive values (account IDs, KV IDs) sanitized"

          - id: "36-D"
            agent: copilot
            subagent: copilot-docs
            title: "Document testing patterns and conventions"
            description: |
              Create testing guide:
              - How to write generator tests (createTestTree pattern)
              - How to write executor tests (mock wrangler CLI)
              - Snapshot testing conventions
              - Fixture management
            deliverables:
              - "packages/nx-cloudflare/TESTING.md"
            depends_on: ["36-Q1"]
            acceptance:
              - "Guide covers generator and executor test patterns"

    # Agent workstreams for NX-1 (parallel within phase)
    workstreams:
      claude:
        sequence: ["41-A", "40-A", "39-A", "38-A", "37-A"]
        deliverables:
          - "docs/nx-plugin/package-spec.md"
          - "All schema.json and schema.d.ts files"
          - "All *.types.ts utility type files"
        handoff_to: codex
        handoff_artifact: "Completed schema files in packages/nx-cloudflare/src/"

      codex:
        sequence: ["41-B", "40-B", "39-B", "38-B", "37-B", "36-B"]
        deliverables:
          - "packages/nx-cloudflare/ (complete scaffold)"
          - "Init generator implementation"
          - "All utility implementations"
        handoff_to: gemini
        handoff_artifact: "Implemented code ready for testing"

      gemini:
        sequence: ["41-Q", "40-Q", "39-Q", "38-Q", "37-Q", "36-Q1", "36-Q2"]
        deliverables:
          - "All __tests__/*.spec.ts files"
          - "Test harness and fixtures"
          - "vitest config"
        handoff_to: copilot
        handoff_artifact: "Test suite passing, coverage report"

      copilot:
        sequence: ["41-D", "40-D", "39-D", "38-D", "37-D", "36-D"]
        deliverables:
          - "README.md"
          - "TESTING.md"
          - "Refined error messages and JSDoc"
        handoff_to: null
        handoff_artifact: "DX polish complete, ready for phase gate"

    gate:
      command: "nx run nx-cloudflare:test && nx run nx-cloudflare:lint"
      checklist:
        - "All NX-1 tests pass"
        - "generators.json has init entry"
        - "Shared utilities exported from utils/index.ts"
        - "No lint errors"
        - "Claude reviews architecture before NX-2/NX-3 start"

  # ═══════════════════════════════════════════════════════════════
  # NX-2: WORKER GENERATOR (parallel with NX-3, depends on NX-1)
  # ═══════════════════════════════════════════════════════════════
  - id: NX-2
    name: "Worker Generator"
    milestone: "NX-2: Worker Gen"
    depends_on: ["NX-1"]
    status: "pending"
    description: |
      Create the worker-api generator that scaffolds a new Cloudflare Worker
      with tenant middleware, health endpoint, and Nx targets for dev/test/deploy.

    exit_criteria:
      - "nx g @crispy/nx-cloudflare:worker my-worker produces runnable worker"
      - "Generated worker has /health endpoint and tenant middleware"
      - "project.json has dev, test, deploy targets"
      - "Executor-to-wrangler mapping defined and tested"
      - "All NX-2 tests pass"

    issues:
      # ── #35: Scaffold worker-api template ───────────────────
      - parent: 35
        title: "[NX-2] Scaffold worker-api template with tenant middleware"
        sub_issues:
          - id: "35-A"
            agent: claude
            subagent: claude-spec
            title: "Define worker template contract"
            description: |
              Define what the worker generator produces:
              - Entry point: src/index.ts (fetch handler with middleware chain)
              - Middleware: tenant resolution → rate limiting → CORS → handler
              - Router: modular route registration
              - Types: re-export Env from packages/core
              Map to existing apps/worker-api patterns.
            deliverables:
              - "packages/nx-cloudflare/src/generators/worker/schema.json"
              - "packages/nx-cloudflare/src/generators/worker/schema.d.ts"
            acceptance:
              - "Template contract matches existing worker-api structure"

          - id: "35-B1"
            agent: codex
            subagent: codex-gen
            title: "Create worker template files"
            description: |
              Create template files in packages/nx-cloudflare/src/generators/worker/files/:
              - __name__/src/index.ts.template (fetch handler + middleware)
              - __name__/src/middleware.ts.template (tenant resolution)
              - __name__/src/router.ts.template (route registration)
              - __name__/tsconfig.json.template
              - __name__/package.json.template
              Use Nx template substitution syntax (<%= name %>, etc.).
            deliverables:
              - "packages/nx-cloudflare/src/generators/worker/files/"
            depends_on: ["35-A"]
            acceptance:
              - "Templates use correct Nx substitution syntax"
              - "Generated code compiles"

          - id: "35-B2"
            agent: codex
            subagent: codex-gen
            title: "Implement worker generator logic"
            description: |
              Implement packages/nx-cloudflare/src/generators/worker/generator.ts:
              - Schema options: name (string), directory (string, default apps/)
              - Generate files from templates
              - Register project in workspace
              - Add project.json with targets
              Wire into generators.json.
            deliverables:
              - "packages/nx-cloudflare/src/generators/worker/generator.ts"
            depends_on: ["35-B1"]
            acceptance:
              - "Generator creates a valid Nx project"

          - id: "35-D"
            agent: copilot
            subagent: copilot-template
            title: "Polish worker template code quality"
            description: |
              Review generated worker code:
              - Ensure middleware chain is readable
              - Add comments explaining tenant resolution flow
              - Use consistent naming conventions
              - Verify strict TypeScript compliance
            deliverables:
              - "Refined template files"
            depends_on: ["35-B1"]
            acceptance:
              - "Generated code passes lint"
              - "Middleware flow is self-documenting"

      # ── #34: Add /health endpoint to template ───────────────
      - parent: 34
        title: "[NX-2] Add /health endpoint to template"
        sub_issues:
          - id: "34-A"
            agent: claude
            subagent: claude-spec
            title: "Define health response schema"
            description: |
              Define /health response:
              - status: "ok" | "degraded"
              - version: string (from package.json or build-time injection)
              - tenant: string (resolved tenant ID or "none")
              - uptime: number (seconds, if trackable)
              - environment: string (dev/stg/prod)
              - timestamp: ISO 8601
            deliverables:
              - "Health response schema definition"
            acceptance:
              - "Schema includes version, tenant, and environment fields"

          - id: "34-B"
            agent: codex
            subagent: codex-gen
            title: "Implement /health handler in worker template"
            description: |
              Add health endpoint to worker template:
              - GET /health returns JSON response
              - Include build-time version from ENVIRONMENT var
              - Include resolved tenant ID (if tenant middleware ran)
              - Add to router.ts template
            deliverables:
              - "Updated router.ts.template with /health route"
            depends_on: ["34-A"]
            acceptance:
              - "/health returns valid JSON with all fields"

          - id: "34-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write health endpoint tests"
            description: |
              Test /health endpoint in generated worker:
              - Returns 200 with correct schema
              - Includes version and environment
              - Works with and without tenant context
            deliverables:
              - "Health endpoint test file in template"
            depends_on: ["34-B"]
            acceptance:
              - "Health response schema validated in test"

          - id: "34-D"
            agent: copilot
            subagent: copilot-template
            title: "Add build-time version injection"
            description: |
              Improve version reporting:
              - Inject git SHA or package version at build time
              - Add to wrangler.jsonc vars as BUILD_VERSION
              - Document the version injection mechanism
            deliverables:
              - "Version injection in template and docs"
            depends_on: ["34-B"]
            acceptance:
              - "Version is traceable to git commit"

      # ── #33: Add project.json targets ───────────────────────
      - parent: 33
        title: "[NX-2] Add project.json targets for dev/test/deploy"
        sub_issues:
          - id: "33-A"
            agent: claude
            subagent: claude-spec
            title: "Define target schemas and configurations"
            description: |
              Define project.json targets the worker generator creates:
              - dev: wrangler dev --config <tenant>/wrangler.jsonc --env dev
              - test: vitest run (with worker-specific config)
              - deploy: wrangler deploy --config <tenant>/wrangler.jsonc --env <env>
              - typecheck: tsc --noEmit
              Define configuration variants per environment (dev, stg, prod).
            deliverables:
              - "Target schema definitions"
            acceptance:
              - "All targets map to wrangler CLI commands correctly"

          - id: "33-B"
            agent: codex
            subagent: codex-gen
            title: "Implement target generation in worker generator"
            description: |
              Update worker generator to create project.json with targets:
              - Use updateProjectConfiguration() from @nx/devkit
              - Generate correct wrangler --config paths per tenant
              - Support environment-specific configurations
              - Add dependency on build target if applicable
            deliverables:
              - "Updated worker generator with target creation"
            depends_on: ["33-A"]
            acceptance:
              - "Generated project.json has all required targets"
              - "nx run <project>:dev starts wrangler dev"

          - id: "33-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Validate generated project.json against Nx schema"
            description: |
              Test generated project.json:
              - All targets have valid executor references
              - Configuration variants are valid
              - Dependencies between targets are correct
              - Nx can parse the generated project configuration
            deliverables:
              - "project.json validation tests"
            depends_on: ["33-B"]
            acceptance:
              - "Generated config passes Nx validation"

          - id: "33-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add environment configuration examples"
            description: |
              Document target usage:
              - nx run worker:dev (local development)
              - nx run worker:deploy --configuration=staging
              - nx run worker:test
              Add inline comments in generated project.json explaining each target.
            deliverables:
              - "Target usage documentation and comments"
            depends_on: ["33-B"]
            acceptance:
              - "Each target has usage example in docs"

      # ── #32: Define executor-to-wrangler mapping ────────────
      - parent: 32
        title: "[NX-2] Define executor-to-wrangler mapping"
        sub_issues:
          - id: "32-A"
            agent: claude
            subagent: claude-spec
            title: "Design executor architecture"
            description: |
              Design how executors map to wrangler CLI:
              - dev executor: nx run worker:dev → wrangler dev --config <path> --env <env>
              - deploy executor: nx run worker:deploy → wrangler deploy --config <path> --env <env>
              - Config resolution: --config tenants/<tenant>/wrangler.jsonc
              - Environment mapping: dev/stg/prod → wrangler --env flag
              - CWD handling: executor runs from workspace root
            deliverables:
              - "packages/nx-cloudflare/src/executors/dev/schema.json"
              - "packages/nx-cloudflare/src/executors/deploy/schema.json"
            acceptance:
              - "Executor schemas cover all wrangler flags needed"
              - "Config path resolution strategy documented"

          - id: "32-B1"
            agent: codex
            subagent: codex-exec
            title: "Implement dev executor"
            description: |
              Implement packages/nx-cloudflare/src/executors/dev/executor.ts:
              - Accept options: tenant, env, port, localProtocol
              - Resolve config path: tenants/<tenant>/wrangler.jsonc
              - Spawn wrangler dev with correct flags
              - Stream output to Nx logger
              Wire into executors.json.
            deliverables:
              - "packages/nx-cloudflare/src/executors/dev/"
            depends_on: ["32-A"]
            acceptance:
              - "nx run worker:dev starts wrangler dev"

          - id: "32-B2"
            agent: codex
            subagent: codex-exec
            title: "Implement deploy executor"
            description: |
              Implement packages/nx-cloudflare/src/executors/deploy/executor.ts:
              - Accept options: tenant, env, dryRun
              - Resolve config path and environment
              - Run validation before deploy (reuse validate-config utility)
              - Spawn wrangler deploy with correct flags
              - Capture deployment result
              Wire into executors.json.
            deliverables:
              - "packages/nx-cloudflare/src/executors/deploy/"
            depends_on: ["32-A"]
            acceptance:
              - "nx run worker:deploy invokes wrangler deploy with correct config"

          - id: "32-Q"
            agent: gemini
            subagent: gemini-integration
            title: "Write executor integration tests"
            description: |
              Test executors:
              - Dev executor resolves correct wrangler config path
              - Deploy executor runs validation before deploy
              - Invalid tenant produces clear error
              - Environment mapping is correct (dev/stg/prod aliases)
              Mock wrangler CLI to avoid actual deploys.
            deliverables:
              - "packages/nx-cloudflare/src/executors/__tests__/"
            depends_on: ["32-B1", "32-B2"]
            acceptance:
              - "Both executors tested with mocked wrangler"

      # ── #31: Create worker generator tests ──────────────────
      - parent: 31
        title: "[NX-2] Create worker generator tests"
        sub_issues:
          - id: "31-Q1"
            agent: gemini
            subagent: gemini-unit
            title: "Write generator output validation tests"
            description: |
              Test the worker generator end-to-end:
              - Generated files list matches expected
              - Generated index.ts compiles (syntax check)
              - Generated project.json is valid
              - Generated files use correct template substitutions
            deliverables:
              - "packages/nx-cloudflare/src/generators/worker/__tests__/generator.spec.ts"
            acceptance:
              - "Full generator output validated"

          - id: "31-Q2"
            agent: gemini
            subagent: gemini-unit
            title: "Write schema compliance and idempotency tests"
            description: |
              Test generator behavior:
              - Schema validation rejects invalid options
              - Generator is idempotent (second run doesn't break)
              - Name conflicts handled gracefully
              - Directory option respected
            deliverables:
              - "Schema and idempotency tests"
            acceptance:
              - "Idempotency proven by test"

          - id: "31-Q3"
            agent: gemini
            subagent: gemini-integration
            title: "Write snapshot tests for generated files"
            description: |
              Create snapshot tests:
              - Snapshot each generated file (index.ts, router.ts, middleware.ts, etc.)
              - Snapshots serve as regression baseline
              - Update process documented
            deliverables:
              - "Snapshot test files + __snapshots__/ directory"
            acceptance:
              - "Snapshots capture full generated output"

          - id: "31-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add test documentation for worker generator"
            description: |
              Document how to:
              - Run worker generator tests
              - Update snapshots after template changes
              - Add new test cases
            deliverables:
              - "Test documentation in TESTING.md"
            depends_on: ["31-Q1"]
            acceptance:
              - "Snapshot update process documented"

    workstreams:
      claude:
        sequence: ["35-A", "34-A", "33-A", "32-A"]
        deliverables:
          - "Worker generator schema.json"
          - "Executor schema.json files"
          - "Health response schema"
        handoff_to: codex
        handoff_artifact: "All schemas and type definitions for NX-2"

      codex:
        sequence: ["35-B1", "35-B2", "34-B", "33-B", "32-B1", "32-B2"]
        deliverables:
          - "Worker generator with templates"
          - "Dev and deploy executors"
          - "/health endpoint in template"
        handoff_to: gemini
        handoff_artifact: "Generator and executor implementations"

      gemini:
        sequence: ["34-Q", "33-Q", "32-Q", "31-Q1", "31-Q2", "31-Q3"]
        deliverables:
          - "Generator tests + snapshot tests"
          - "Executor integration tests"
          - "Health endpoint tests"
        handoff_to: copilot
        handoff_artifact: "All NX-2 tests passing"

      copilot:
        sequence: ["35-D", "34-D", "33-D", "31-D"]
        deliverables:
          - "Polished templates"
          - "Target usage docs"
          - "Test documentation"
        handoff_to: null
        handoff_artifact: "NX-2 DX complete"

    gate:
      command: "nx run nx-cloudflare:test --testPathPattern=worker"
      checklist:
        - "Worker generator produces runnable worker"
        - "Dev and deploy executors work with existing tenants"
        - "/health endpoint returns valid schema"
        - "All NX-2 tests pass"

  # ═══════════════════════════════════════════════════════════════
  # NX-3: TENANT GENERATOR (parallel with NX-2, depends on NX-1)
  # ═══════════════════════════════════════════════════════════════
  - id: NX-3
    name: "Tenant Generator"
    milestone: "NX-3: Tenant Gen"
    depends_on: ["NX-1"]
    status: "pending"
    description: |
      Create the tenant generator that scaffolds a new tenant directory with
      tenant.config.json, wrangler.jsonc, and optional registry for discovery.

    exit_criteria:
      - "nx g @crispy/nx-cloudflare:tenant my-tenant produces valid tenant directory"
      - "Generated tenant.config.json passes validation"
      - "Generated wrangler.jsonc has all required binding placeholders"
      - "Tenant registry updated on generation"
      - "All NX-3 tests pass"

    issues:
      # ── #30: Scaffold tenant folder structure ───────────────
      - parent: 30
        title: "[NX-3] Scaffold tenant folder structure"
        sub_issues:
          - id: "30-A"
            agent: claude
            subagent: claude-spec
            title: "Define tenant directory specification"
            description: |
              Define the tenant scaffold output:
              Required files:
              - tenants/<id>/tenant.config.json
              - tenants/<id>/wrangler.jsonc
              Optional:
              - tenants/<id>/policies.json
              - tenants/<id>/prompts/*.md
              - tenants/<id>/.env.dev, .env.stg (gitignored)
              Schema options: tenantId (string), accountId (string), aiGatewayId (string).
            deliverables:
              - "packages/nx-cloudflare/src/generators/tenant/schema.json"
              - "packages/nx-cloudflare/src/generators/tenant/schema.d.ts"
            acceptance:
              - "Schema covers all required tenant config fields"

          - id: "30-B"
            agent: codex
            subagent: codex-gen
            title: "Implement tenant generator"
            description: |
              Implement packages/nx-cloudflare/src/generators/tenant/generator.ts:
              - Create tenants/<tenantId>/ directory
              - Generate tenant.config.json from template with defaults
              - Generate wrangler.jsonc from template with binding placeholders
              - Create optional directories (prompts/, policies.json stub)
              - Update tenant registry if it exists
              Use generateFiles() from @nx/devkit.
            deliverables:
              - "packages/nx-cloudflare/src/generators/tenant/"
            depends_on: ["30-A"]
            acceptance:
              - "Generated files match expected structure"

          - id: "30-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write scaffold validation tests"
            description: |
              Test tenant generator:
              - Creates expected directory structure
              - Generated tenant.config.json is valid
              - Generated wrangler.jsonc is valid JSONC
              - Optional directories created correctly
              - Duplicate tenant ID rejected
            deliverables:
              - "packages/nx-cloudflare/src/generators/tenant/__tests__/generator.spec.ts"
            depends_on: ["30-B"]
            acceptance:
              - "Directory structure validated"
              - "Duplicate detection tested"

          - id: "30-D"
            agent: copilot
            subagent: copilot-template
            title: "Add post-generation instructions"
            description: |
              After tenant generation, output:
              - Next steps: fill in account_id, KV namespace IDs, etc.
              - How to validate: nx run validate --tenant=<name>
              - How to deploy: nx run deploy --tenant=<name>
              Add helpful comments in generated config files.
            deliverables:
              - "Post-generation output and inline comments"
            depends_on: ["30-B"]
            acceptance:
              - "New user can follow instructions to set up tenant"

      # ── #29: Generate tenant.config.json template ───────────
      - parent: 29
        title: "[NX-3] Generate tenant.config.json template"
        sub_issues:
          - id: "29-A"
            agent: claude
            subagent: claude-spec
            title: "Define tenant config template with field documentation"
            description: |
              Define the tenant.config.json template content:
              - All required fields with placeholder values
              - All optional fields with commented defaults
              - Field documentation as JSONC comments (if using JSONC) or separate doc
              Match existing schema from scripts/validate-config.mjs.
            deliverables:
              - "Template spec with field documentation"
            acceptance:
              - "Template matches Zod schema exactly"

          - id: "29-B"
            agent: codex
            subagent: codex-gen
            title: "Implement tenant.config.json template generation"
            description: |
              Create template file:
              packages/nx-cloudflare/src/generators/tenant/files/__tenantId__/tenant.config.json.template
              - Substitute tenantId, accountId, aiGatewayId from generator options
              - Set sensible defaults for rate limits, models, feature flags
              - Use template substitution: <%= tenantId %>
            deliverables:
              - "tenant.config.json.template"
            depends_on: ["29-A"]
            acceptance:
              - "Generated config passes Zod validation"

          - id: "29-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write config template validation tests"
            description: |
              Test generated tenant.config.json:
              - Passes Zod validation with default values
              - All required fields present
              - Template substitutions applied correctly
              - Custom values override defaults
            deliverables:
              - "Config template tests"
            depends_on: ["29-B"]
            acceptance:
              - "Generated config validates against Zod schema"

          - id: "29-D"
            agent: copilot
            subagent: copilot-template
            title: "Add inline documentation in generated config"
            description: |
              Add helpful comments above each field in the template:
              - Explain what each field does
              - Show valid values/ranges
              - Link to docs for complex fields (featureFlags, tokenBudget)
            deliverables:
              - "Documented config template"
            depends_on: ["29-B"]
            acceptance:
              - "Each field has explanatory comment"

      # ── #28: Generate wrangler.jsonc template ───────────────
      - parent: 28
        title: "[NX-3] Generate wrangler.jsonc template"
        sub_issues:
          - id: "28-A"
            agent: claude
            subagent: claude-spec
            title: "Define wrangler.jsonc template structure"
            description: |
              Define the generated wrangler.jsonc:
              - Required bindings: KV (RATE_LIMITER, CONFIG, CACHE), D1 (DB),
                Vectorize (VECTORIZE), AI, DO (RATE_LIMITER_DO, CHAT_SESSION)
              - Environment sections: dev, stg, prod (with aliases)
              - Placeholder values for IDs (marked as TODO)
              - Reduce duplication from current pattern (542 lines per tenant!)
              Consider using wrangler inheritance or shared config patterns.
            deliverables:
              - "Wrangler template spec"
            acceptance:
              - "All required bindings present"
              - "Template is <200 lines (reduce duplication)"

          - id: "28-B"
            agent: codex
            subagent: codex-gen
            title: "Implement wrangler.jsonc template generation"
            description: |
              Create template file:
              packages/nx-cloudflare/src/generators/tenant/files/__tenantId__/wrangler.jsonc.template
              - Include all required bindings with TODO placeholder IDs
              - Include environment sections (dev, stg, prod)
              - Use JSONC comments explaining each binding
              - Reference main entry point: ../../apps/worker-api/src/index.ts
            deliverables:
              - "wrangler.jsonc.template"
            depends_on: ["28-A"]
            acceptance:
              - "Generated wrangler.jsonc is valid JSONC"
              - "All required bindings present"

          - id: "28-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write wrangler config validation tests"
            description: |
              Test generated wrangler.jsonc:
              - Is valid JSONC (parseable with jsonc-parser)
              - Contains all required binding types
              - Environment sections exist (dev, stg, prod)
              - Placeholder values are clearly marked as TODO
            deliverables:
              - "Wrangler template validation tests"
            depends_on: ["28-B"]
            acceptance:
              - "Binding completeness validated"

          - id: "28-D"
            agent: copilot
            subagent: copilot-template
            title: "Add JSONC comments explaining each binding section"
            description: |
              Annotate the wrangler.jsonc template:
              - Explain each binding type (KV, DO, D1, Vectorize, AI)
              - Note which IDs need to be created in Cloudflare dashboard
              - Add environment-specific notes (remote: true for non-local)
              - Link to Cloudflare docs for binding setup
            deliverables:
              - "Annotated wrangler.jsonc template"
            depends_on: ["28-B"]
            acceptance:
              - "Every binding section has explanatory comment"

      # ── #27: Tenant registry ────────────────────────────────
      - parent: 27
        title: "[NX-3] Add tenant registry file for discoverability"
        sub_issues:
          - id: "27-A"
            agent: claude
            subagent: claude-spec
            title: "Define tenant registry schema"
            description: |
              Define tenants.registry.json:
              - Array of { tenantId, accountId, createdAt, status }
              - Updated automatically by tenant generator
              - Used by deploy-all for tenant discovery
              - Alternative to current fs-based discovery (glob tenants/*/tenant.config.json)
            deliverables:
              - "Registry schema definition"
            acceptance:
              - "Schema supports tenant lifecycle (active/disabled)"

          - id: "27-B"
            agent: codex
            subagent: codex-gen
            title: "Implement registry update in tenant generator"
            description: |
              Update tenant generator to:
              - Create tenants/tenants.registry.json if not exists
              - Append new tenant entry on generation
              - Deduplicate entries
              - Export readTenantRegistry() utility for executors
            deliverables:
              - "Registry logic in tenant generator"
              - "packages/nx-cloudflare/src/utils/tenant-registry.ts"
            depends_on: ["27-A"]
            acceptance:
              - "Registry updated on tenant generation"
              - "Existing tenants can be migrated to registry"

          - id: "27-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write registry consistency tests"
            description: |
              Test registry:
              - New tenant added to registry
              - Duplicate tenant rejected
              - Registry readable by deploy executor
              - Missing registry file handled gracefully
            deliverables:
              - "Registry tests"
            depends_on: ["27-B"]
            acceptance:
              - "Registry consistency proven"

          - id: "27-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add tenant discovery CLI helper"
            description: |
              Add a list-tenants utility:
              - Read registry and display tenant table
              - Show status, account, created date
              - Can be used as an Nx target: nx run workspace:list-tenants
            deliverables:
              - "List tenants utility and docs"
            depends_on: ["27-B"]
            acceptance:
              - "Tenant list is readable in terminal"

      # ── #26: Tenant generator tests ─────────────────────────
      - parent: 26
        title: "[NX-3] Create tenant generator tests"
        sub_issues:
          - id: "26-Q1"
            agent: gemini
            subagent: gemini-unit
            title: "Write end-to-end tenant generator tests"
            description: |
              Test full tenant generation flow:
              - Scaffold → validate config → validate wrangler → check registry
              - All generated files exist and are valid
              - Generator options applied correctly
            deliverables:
              - "packages/nx-cloudflare/src/generators/tenant/__tests__/e2e.spec.ts"
            acceptance:
              - "Full flow tested"

          - id: "26-Q2"
            agent: gemini
            subagent: gemini-unit
            title: "Write config and wrangler validity tests"
            description: |
              Test generated configs in isolation:
              - tenant.config.json passes Zod validation
              - wrangler.jsonc passes JSONC parse + binding check
              - Cross-file consistency (accountId match)
            deliverables:
              - "Config validity tests"
            acceptance:
              - "Both config files validated"

          - id: "26-Q3"
            agent: gemini
            subagent: gemini-integration
            title: "Write generator + registry integration tests"
            description: |
              Test generator and registry together:
              - Generate 3 tenants → registry has 3 entries
              - Delete tenant → registry reflects removal (if supported)
              - Registry used by deploy-all discovery
            deliverables:
              - "Integration tests"
            acceptance:
              - "Multi-tenant registry tested"

          - id: "26-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add tenant generator test documentation"
            description: |
              Document testing patterns:
              - How to test tenant generation
              - How to validate generated configs
              - Registry testing patterns
            deliverables:
              - "Test docs in TESTING.md"
            depends_on: ["26-Q1"]
            acceptance:
              - "Testing patterns documented"

    workstreams:
      claude:
        sequence: ["30-A", "29-A", "28-A", "27-A"]
        deliverables:
          - "Tenant generator schema"
          - "Config and wrangler template specs"
          - "Registry schema"
        handoff_to: codex
        handoff_artifact: "All NX-3 schemas and specs"

      codex:
        sequence: ["30-B", "29-B", "28-B", "27-B"]
        deliverables:
          - "Tenant generator implementation"
          - "Config and wrangler templates"
          - "Registry utility"
        handoff_to: gemini
        handoff_artifact: "Tenant generator ready for testing"

      gemini:
        sequence: ["30-Q", "29-Q", "28-Q", "27-Q", "26-Q1", "26-Q2", "26-Q3"]
        deliverables:
          - "Generator tests"
          - "Config validation tests"
          - "Registry integration tests"
        handoff_to: copilot
        handoff_artifact: "All NX-3 tests passing"

      copilot:
        sequence: ["30-D", "29-D", "28-D", "27-D", "26-D"]
        deliverables:
          - "Template annotations"
          - "Post-generation instructions"
          - "Test documentation"
        handoff_to: null
        handoff_artifact: "NX-3 DX complete"

    gate:
      command: "nx run nx-cloudflare:test --testPathPattern=tenant"
      checklist:
        - "Tenant generator produces valid tenant directory"
        - "Generated configs pass validation"
        - "Registry updated correctly"
        - "All NX-3 tests pass"

  # ═══════════════════════════════════════════════════════════════
  # NX-4: BINDING & DEPLOY GENERATORS (depends on NX-2 + NX-3)
  # ═══════════════════════════════════════════════════════════════
  - id: NX-4
    name: "Binding & Deploy Generators"
    milestone: "NX-4: Bindings"
    depends_on: ["NX-2", "NX-3"]
    status: "pending"
    description: |
      Create binding generators (KV/DO/Vectorize/AI), Env type generation,
      DO class scaffolding, and the deployAll executor with concurrency,
      dry-run, and error handling.

    exit_criteria:
      - "nx g @crispy/nx-cloudflare:binding --type=kv --name=CACHE adds binding to wrangler.jsonc"
      - "Env type auto-generated from wrangler bindings"
      - "DO class skeleton generated with correct Cloudflare types"
      - "deployAll executor deploys all tenants with concurrency control"
      - "dry-run and continue-on-error flags work"
      - "All NX-4 tests pass"

    issues:
      # ── #25: Implement binding generator ────────────────────
      - parent: 25
        title: "[NX-4] Implement binding generator (KV/DO/Vectorize/AI)"
        sub_issues:
          - id: "25-A"
            agent: claude
            subagent: claude-spec
            title: "Define binding generator schema per type"
            description: |
              Define generator schema for each binding type:
              - KV: name (binding name), namespaceId, previewId
              - DO: name, className, sqliteStorage (boolean)
              - Vectorize: name, indexName
              - AI: name (default "AI"), remote (boolean)
              - D1: name, databaseName, databaseId
              Each type updates wrangler.jsonc differently.
              Schema option: type (enum: kv|do|vectorize|ai|d1), plus type-specific fields.
            deliverables:
              - "packages/nx-cloudflare/src/generators/binding/schema.json"
              - "packages/nx-cloudflare/src/generators/binding/schema.d.ts"
            acceptance:
              - "All 5 binding types covered"
              - "Type-specific fields validated"

          - id: "25-B1"
            agent: codex
            subagent: codex-gen
            title: "Implement KV and D1 binding generation"
            description: |
              Implement binding generator for KV and D1:
              - Read tenant's wrangler.jsonc using readJsonc utility
              - Add binding to correct section (kv_namespaces, d1_databases)
              - Update all environment sections (dev, stg, prod)
              - Prevent duplicate bindings
              Use updateJsonc utility from NX-1.
            deliverables:
              - "KV and D1 binding generation logic"
            depends_on: ["25-A"]
            acceptance:
              - "KV binding added to all env sections"
              - "D1 binding added correctly"
              - "No duplicates"

          - id: "25-B2"
            agent: codex
            subagent: codex-gen
            title: "Implement DO, Vectorize, and AI binding generation"
            description: |
              Implement binding generator for DO, Vectorize, AI:
              - DO: add to durable_objects.bindings + migrations if new class
              - Vectorize: add to vectorize array
              - AI: add ai section (simple object)
              - Each type has specific wrangler.jsonc structure
              Handle migrations array for DO (new_sqlite_classes).
            deliverables:
              - "DO, Vectorize, AI binding generation logic"
            depends_on: ["25-A"]
            acceptance:
              - "DO binding includes migration entry"
              - "Vectorize binding includes index_name"

          - id: "25-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write binding generation tests per type"
            description: |
              Test each binding type:
              - KV: adds to kv_namespaces in all envs
              - DO: adds to durable_objects.bindings + migrations
              - Vectorize: adds to vectorize array
              - AI: adds ai section
              - D1: adds to d1_databases
              - Duplicate prevention works
              - Invalid type rejected
            deliverables:
              - "packages/nx-cloudflare/src/generators/binding/__tests__/"
            depends_on: ["25-B1", "25-B2"]
            acceptance:
              - "Every binding type has dedicated test"

      # ── #24: Update Env typing ──────────────────────────────
      - parent: 24
        title: "[NX-4] Update Env typing from single canonical file"
        sub_issues:
          - id: "24-A"
            agent: claude
            subagent: claude-spec
            title: "Define Env type generation strategy"
            description: |
              Design how to keep packages/core/src/env.ts in sync with wrangler bindings:
              - Read all bindings from a tenant's wrangler.jsonc
              - Generate TypeScript interface with correct Cloudflare types:
                KV → KVNamespace, DO → DurableObjectNamespace, Vectorize → Vectorize,
                AI → Ai, D1 → D1Database
              - Handle vars (string/number/boolean types)
              - Single source of truth: wrangler.jsonc → env.ts (codegen direction)
            deliverables:
              - "Env generation spec"
            acceptance:
              - "All Cloudflare binding types mapped to TS types"
              - "Codegen direction clearly defined"

          - id: "24-B"
            agent: codex
            subagent: codex-gen
            title: "Implement Env type code generation"
            description: |
              Implement packages/nx-cloudflare/src/generators/env-type/generator.ts:
              - Read wrangler.jsonc bindings (KV, DO, Vectorize, AI, D1)
              - Read vars section
              - Generate TypeScript interface
              - Write to packages/core/src/env.ts (or configurable path)
              - Preserve manual additions (marked with // custom section)
              This can be a standalone generator: nx g @crispy/nx-cloudflare:env-type
            deliverables:
              - "packages/nx-cloudflare/src/generators/env-type/"
            depends_on: ["24-A"]
            acceptance:
              - "Generated Env type matches current packages/core/src/env.ts"

          - id: "24-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write Env type generation tests"
            description: |
              Test Env codegen:
              - Generated interface has all bindings from wrangler.jsonc
              - Type names are correct (KVNamespace, Vectorize, etc.)
              - Vars have correct types (string for string, number for number)
              - Re-running doesn't duplicate entries
            deliverables:
              - "Env type generation tests"
            depends_on: ["24-B"]
            acceptance:
              - "Generated Env matches expected for existing tenants"

          - id: "24-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add type drift detection CI check"
            description: |
              Add a check that detects when env.ts is out of sync with wrangler.jsonc:
              - Run env-type generator in --check mode (diff, don't write)
              - If drift detected, fail CI with instructions
              - Document in CI pipeline
            deliverables:
              - "Drift detection check and docs"
            depends_on: ["24-B"]
            acceptance:
              - "Drift detected and reported clearly"

      # ── #23: DO class skeleton generation ───────────────────
      - parent: 23
        title: "[NX-4] Add DO class skeleton generation"
        sub_issues:
          - id: "23-A"
            agent: claude
            subagent: claude-spec
            title: "Define DO class template"
            description: |
              Define the Durable Object class skeleton:
              - Constructor with DurableObjectState and Env params
              - fetch() handler (HTTP interface)
              - alarm() handler (optional)
              - SQLite storage setup (new DOs use SQLite by default)
              - Correct Cloudflare types: DurableObject, DurableObjectState
              Match existing DO patterns (ChatSession, RateLimiter).
            deliverables:
              - "DO class template spec"
            acceptance:
              - "Template uses correct Cloudflare DO API (2026)"

          - id: "23-B"
            agent: codex
            subagent: codex-gen
            title: "Implement DO class generator"
            description: |
              Add DO generation to binding generator or as separate generator:
              - When type=do and new className, generate class file
              - Template: class __className__ extends DurableObject { ... }
              - Include constructor, fetch, alarm stubs
              - Place in apps/<worker>/src/durable-objects/__className__.ts
              - Add to wrangler.jsonc migrations
            deliverables:
              - "DO class generation logic and template"
            depends_on: ["23-A"]
            acceptance:
              - "Generated DO class compiles"
              - "Wrangler migrations updated"

          - id: "23-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write DO skeleton validation tests"
            description: |
              Test DO generation:
              - Generated class extends DurableObject
              - Constructor has correct params
              - File placed in correct directory
              - Wrangler migrations include new class
              - Duplicate class name handled
            deliverables:
              - "DO generation tests"
            depends_on: ["23-B"]
            acceptance:
              - "DO skeleton validated structurally"

          - id: "23-D"
            agent: copilot
            subagent: copilot-template
            title: "Add DO best practices comments in template"
            description: |
              Annotate the DO class template:
              - Explain SQLite vs KV storage tradeoffs
              - Note concurrency limits (~1K req/s)
              - Add example storage operations
              - Link to Cloudflare DO docs
            deliverables:
              - "Annotated DO template"
            depends_on: ["23-B"]
            acceptance:
              - "Template includes practical guidance"

      # ── #22: Implement deployAll executor ───────────────────
      - parent: 22
        title: "[NX-4] Implement deployAll executor"
        sub_issues:
          - id: "22-A"
            agent: claude
            subagent: claude-spec
            title: "Define deployAll executor schema"
            description: |
              Define executor options:
              - env: string (required, dev/stg/prod)
              - only: string[] (optional, filter to specific tenants)
              - concurrency: number (default 1, max parallel deploys)
              - dryRun: boolean (preview only, no deploy)
              - continueOnError: boolean (don't stop on failure)
              Design result format: { tenant, status, duration, error? }[]
            deliverables:
              - "packages/nx-cloudflare/src/executors/deploy-all/schema.json"
            acceptance:
              - "All options from existing deploy-all.mjs captured"

          - id: "22-B"
            agent: codex
            subagent: codex-exec
            title: "Implement deployAll executor core"
            description: |
              Implement packages/nx-cloudflare/src/executors/deploy-all/executor.ts:
              - Discover tenants from registry (or glob fallback)
              - Filter by --only option
              - For each tenant: resolve config, validate, deploy
              - Collect results and report summary
              - Reuse deploy executor for individual tenant deploys
              Wire into executors.json.
            deliverables:
              - "packages/nx-cloudflare/src/executors/deploy-all/"
            depends_on: ["22-A"]
            acceptance:
              - "Deploys all tenants with correct config paths"
              - "Reports per-tenant status"

          - id: "22-Q"
            agent: gemini
            subagent: gemini-integration
            title: "Write deployAll executor tests"
            description: |
              Test deployAll:
              - Discovers all tenants from registry
              - --only filter works
              - Result format correct
              - Failed deploy reported (not swallowed)
              Mock wrangler CLI.
            deliverables:
              - "deployAll executor tests"
            depends_on: ["22-B"]
            acceptance:
              - "Full deploy flow tested with mocks"

          - id: "22-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add deployment progress reporting"
            description: |
              Improve deployAll UX:
              - Progress bar or status table during deploy
              - Summary table at end (tenant, status, duration)
              - Color-coded output (green=success, red=fail)
              - Total duration reporting
            deliverables:
              - "Progress reporting and summary output"
            depends_on: ["22-B"]
            acceptance:
              - "Deploy summary is readable at a glance"

      # ── #21: Concurrency policy ─────────────────────────────
      - parent: 21
        title: "[NX-4] Add concurrency policy to deployAll"
        sub_issues:
          - id: "21-A"
            agent: claude
            subagent: claude-spec
            title: "Define concurrency options"
            description: |
              Define concurrency model:
              - --concurrency=1 (sequential, default, safest)
              - --concurrency=N (parallel with N limit)
              - Resource considerations: API rate limits, wrangler login tokens
              Recommend p-limit or similar for implementation.
            deliverables:
              - "Concurrency spec"
            acceptance:
              - "Default is sequential (safest)"
              - "Resource constraints documented"

          - id: "21-B"
            agent: codex
            subagent: codex-exec
            title: "Implement concurrency control"
            description: |
              Add concurrency to deployAll executor:
              - Use p-limit (or native Promise pool) for concurrent deploys
              - Default concurrency=1 (sequential)
              - Respect --concurrency option
              - Ensure cleanup on abort/error
            deliverables:
              - "Concurrency implementation in deployAll"
            depends_on: ["21-A"]
            acceptance:
              - "Concurrent deploys limited to N"
              - "Sequential mode works"

          - id: "21-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write concurrency behavior tests"
            description: |
              Test concurrency:
              - concurrency=1 runs sequentially
              - concurrency=3 runs max 3 in parallel
              - All tenants eventually deployed regardless of concurrency
              - Timing validates concurrency (parallel is faster)
            deliverables:
              - "Concurrency tests"
            depends_on: ["21-B"]
            acceptance:
              - "Concurrency limit proven by timing test"

          - id: "21-D"
            agent: copilot
            subagent: copilot-template
            title: "Add resource management and cleanup"
            description: |
              Ensure robust concurrency:
              - Clean up on SIGINT/SIGTERM
              - Log which deploys are in-flight on abort
              - Recommend safe concurrency values in docs
            deliverables:
              - "Cleanup handling and docs"
            depends_on: ["21-B"]
            acceptance:
              - "Graceful abort documented and handled"

      # ── #20: Dry-run mode ───────────────────────────────────
      - parent: 20
        title: "[NX-4] Add dry-run mode to deployAll"
        sub_issues:
          - id: "20-A"
            agent: claude
            subagent: claude-spec
            title: "Define dry-run output format"
            description: |
              Define what --dry-run shows:
              - List of tenants that would be deployed
              - Config path and environment per tenant
              - Validation results (pass/fail) per tenant
              - No actual wrangler deploy executed
            deliverables:
              - "Dry-run output spec"
            acceptance:
              - "User can verify deploy plan before executing"

          - id: "20-B"
            agent: codex
            subagent: codex-exec
            title: "Implement --dry-run flag"
            description: |
              Add dry-run to deployAll executor:
              - When --dry-run, run validation only
              - Print deploy plan: tenant → config → env
              - Show what wrangler command would be executed
              - Exit with 0 if all valid, 1 if validation errors
            deliverables:
              - "Dry-run implementation"
            depends_on: ["20-A"]
            acceptance:
              - "No wrangler deploy executed in dry-run"
              - "Output shows planned actions"

          - id: "20-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write dry-run validation tests"
            description: |
              Test dry-run:
              - No deployment happens (mock not called)
              - Validation errors surfaced
              - Output contains all tenant plans
              - Exit code reflects validation status
            deliverables:
              - "Dry-run tests"
            depends_on: ["20-B"]
            acceptance:
              - "Zero deploy calls in dry-run proven by mock"

          - id: "20-D"
            agent: copilot
            subagent: copilot-template
            title: "Add formatted dry-run preview output"
            description: |
              Format dry-run output:
              - Table format: tenant | env | config | status
              - Show wrangler command that would run
              - Color validation status (green/red)
            deliverables:
              - "Formatted dry-run output"
            depends_on: ["20-B"]
            acceptance:
              - "Dry-run output is terminal-friendly table"

      # ── #19: Continue-on-error flag ─────────────────────────
      - parent: 19
        title: "[NX-4] Add continue-on-error flag to deployAll"
        sub_issues:
          - id: "19-A"
            agent: claude
            subagent: claude-spec
            title: "Define error handling strategy"
            description: |
              Define behavior:
              - Default: stop on first failure (fail-fast)
              - --continue-on-error: continue deploying remaining tenants
              - Report format: { succeeded: [], failed: [{ tenant, error }] }
              - Exit code: 0 if all succeed, 1 if any failed
              Design partial success handling.
            deliverables:
              - "Error handling spec"
            acceptance:
              - "Fail-fast vs continue-on-error clearly defined"

          - id: "19-B"
            agent: codex
            subagent: codex-exec
            title: "Implement --continue-on-error flag"
            description: |
              Add to deployAll executor:
              - Default: throw on first deploy failure
              - With flag: catch errors, collect failed results, continue
              - Final summary: N succeeded, M failed
              - Failed tenants listed with error messages
            deliverables:
              - "Continue-on-error implementation"
            depends_on: ["19-A"]
            acceptance:
              - "Remaining tenants deployed after failure"
              - "Failed tenants reported"

          - id: "19-Q"
            agent: gemini
            subagent: gemini-unit
            title: "Write partial failure scenario tests"
            description: |
              Test continue-on-error:
              - 3 tenants, middle one fails → other 2 succeed
              - Without flag: stops at failure
              - With flag: all 3 attempted, 2 succeed
              - Summary report accurate
            deliverables:
              - "Partial failure tests"
            depends_on: ["19-B"]
            acceptance:
              - "Partial success proven by test"

          - id: "19-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add error summary and retry suggestions"
            description: |
              Improve error output:
              - Summary: "2/3 tenants deployed successfully. 1 failed."
              - Failed tenant: error message + suggested fix
              - Retry command: "To retry failed: nx run deploy-all --only=<failed>"
            deliverables:
              - "Error summary and retry suggestions"
            depends_on: ["19-B"]
            acceptance:
              - "Retry command included in failure output"

      # ── #18: Binding generator/executor tests ───────────────
      - parent: 18
        title: "[NX-4] Create binding generator/executor tests"
        sub_issues:
          - id: "18-Q1"
            agent: gemini
            subagent: gemini-unit
            title: "Write binding generator unit tests"
            description: |
              Test each binding type generation:
              - KV binding added correctly
              - DO binding with migration
              - Vectorize binding with index_name
              - AI binding
              - D1 binding
              - Invalid type rejected
              - Duplicate binding prevented
            deliverables:
              - "Binding generator unit tests"
            acceptance:
              - "Every binding type has add + duplicate test"

          - id: "18-Q2"
            agent: gemini
            subagent: gemini-integration
            title: "Write executor integration tests"
            description: |
              Test executors end-to-end:
              - deploy executor: validates → deploys → reports
              - deployAll: discovers → validates → deploys each → reports
              - dev executor: starts wrangler dev with correct config
              Mock wrangler CLI for all tests.
            deliverables:
              - "Executor integration tests"
            acceptance:
              - "All 3 executors tested end-to-end"

          - id: "18-Q3"
            agent: gemini
            subagent: gemini-unit
            title: "Write snapshot tests for generated outputs"
            description: |
              Snapshot tests:
              - Generated wrangler.jsonc after binding addition
              - Generated DO class file
              - Generated Env type file
              - deployAll summary output format
            deliverables:
              - "Snapshot tests for NX-4 outputs"
            acceptance:
              - "All generated outputs have snapshots"

          - id: "18-D"
            agent: copilot
            subagent: copilot-docs
            title: "Add NX-4 test documentation"
            description: |
              Document:
              - How to test binding generators
              - How to mock wrangler CLI in executor tests
              - Snapshot update process
              - CI gate configuration
            deliverables:
              - "NX-4 test documentation"
            depends_on: ["18-Q1"]
            acceptance:
              - "Test patterns documented for all NX-4 components"

    workstreams:
      claude:
        sequence: ["25-A", "24-A", "23-A", "22-A", "21-A", "20-A", "19-A"]
        deliverables:
          - "Binding generator schema (all 5 types)"
          - "Env type generation spec"
          - "DO template spec"
          - "deployAll executor schema"
          - "Concurrency, dry-run, error handling specs"
        handoff_to: codex
        handoff_artifact: "All NX-4 schemas and specs"

      codex:
        sequence: ["25-B1", "25-B2", "24-B", "23-B", "22-B", "21-B", "20-B", "19-B"]
        deliverables:
          - "Binding generator (all types)"
          - "Env type generator"
          - "DO class generator"
          - "deployAll executor with all flags"
        handoff_to: gemini
        handoff_artifact: "NX-4 generators and executors implemented"

      gemini:
        sequence: ["25-Q", "24-Q", "23-Q", "22-Q", "21-Q", "20-Q", "19-Q", "18-Q1", "18-Q2", "18-Q3"]
        deliverables:
          - "Binding generation tests (per type)"
          - "Env type tests"
          - "DO skeleton tests"
          - "Executor integration tests"
          - "Snapshot tests"
        handoff_to: copilot
        handoff_artifact: "All NX-4 tests passing"

      copilot:
        sequence: ["24-D", "23-D", "22-D", "21-D", "20-D", "19-D", "18-D"]
        deliverables:
          - "Drift detection check"
          - "DO best practices docs"
          - "Deploy progress reporting"
          - "Error and retry suggestions"
          - "Test documentation"
        handoff_to: null
        handoff_artifact: "NX-4 DX complete"

    gate:
      command: "nx run nx-cloudflare:test"
      checklist:
        - "All binding types generate correctly"
        - "Env type stays in sync with bindings"
        - "deployAll works with all flags"
        - "All NX-4 tests pass"
        - "Full plugin test suite green"

# ─────────────────────────────────────────────────────────────────
# ORCHESTRATION RULES
# ─────────────────────────────────────────────────────────────────

orchestration:
  execution_topology: |
    NX-1 (sequential: all 4 agents work on foundation)
      ├── NX-2 (parallel branch A: Claude+Codex on worker gen)
      ├── NX-3 (parallel branch B: Claude+Codex on tenant gen)
      └── NX-4 (join: depends on NX-2 + NX-3 complete)

  parallel_strategy:
    within_phase: |
      Claude starts first (specs/schemas), hands off to Codex (implementation),
      then Gemini (testing), then Copilot (DX). Within each handoff, the next
      agent can start on items whose dependencies are met.
    across_phases: |
      NX-2 and NX-3 run in parallel once NX-1 completes.
      Within parallel phases, each agent team works independently:
      - Claude writes NX-2 specs AND NX-3 specs concurrently
      - Codex implements NX-2 AND NX-3 concurrently
      - Gemini tests NX-2 AND NX-3 concurrently
      - Copilot polishes NX-2 AND NX-3 concurrently

  handoff_protocol:
    format: "PR or branch merge"
    rules:
      - "Claude creates spec branch: spec/nx-<phase>-<issue>"
      - "Codex creates impl branch: impl/nx-<phase>-<issue>"
      - "Gemini creates test branch: test/nx-<phase>-<issue>"
      - "Copilot creates dx branch: dx/nx-<phase>-<issue>"
      - "Each agent merges to phase branch: nx-<phase>"
      - "Phase branch merges to main after gate passes"

  conflict_resolution:
    - "Schema conflicts: Claude has final say"
    - "Implementation conflicts: Codex has final say"
    - "Test coverage disputes: Gemini has final say"
    - "DX/naming conflicts: Copilot has final say"
    - "Cross-cutting: Claude reviews, team consensus"

  communication:
    sync_points:
      - "After each phase gate (NX-1 → NX-2/3 → NX-4)"
      - "After each agent completes their workstream within a phase"
    artifacts:
      - "Phase gate report (what passed, what failed, blockers)"
      - "Handoff checklist (files created, tests passing, docs updated)"

  milestone_report_template: |
    # Phase Report: <phase-id> <phase-name>
    ## Agent Deliverables
    - Claude: <list>
    - Codex: <list>
    - Gemini: <list>
    - Copilot: <list>
    ## Gate Results
    - Tests: <pass/fail count>
    - Lint: <pass/fail>
    - Coverage: <percentage>
    ## Blockers
    - <list or "none">
    ## Next Phase Dependencies Met
    - <yes/no with details>

# ─────────────────────────────────────────────────────────────────
# AGENT PROMPTS (phase-specific extensions)
# ─────────────────────────────────────────────────────────────────

agent_prompts:
  shared_nx_prompt: |
    You are working on the Nx plugin for a multi-tenant Cloudflare Workers AI monorepo.
    The plugin lives at packages/nx-cloudflare and provides generators + executors.
    Use @nx/devkit APIs (Tree, generateFiles, updateJson, updateProjectConfiguration).
    Validate against Nx 19.x API and Cloudflare wrangler 4.x schema.
    Existing patterns: see tenants/mrrainbowsmoke/ for real config examples.
    Env type source of truth: packages/core/src/env.ts.
    Required bindings: KV(RATE_LIMITER,CONFIG,CACHE), D1(DB), Vectorize(VECTORIZE),
    AI, DO(RATE_LIMITER_DO,CHAT_SESSION).

  claude_nx_prompt: |
    Define schemas, types, and contracts for each Nx generator and executor.
    Output JSON Schema files for generator options.
    Output TypeScript type definitions for configs and results.
    Ensure tenant isolation is preserved in all generated code.
    Review that generated wrangler.jsonc includes all required bindings.

  codex_nx_prompt: |
    Implement generators using @nx/devkit Tree API.
    Use generateFiles() for template-based scaffolding.
    Use updateJson() and the shared updateJsonc() utility for config updates.
    Follow existing monorepo patterns (ESM, strict TypeScript, vitest).
    Keep generators idempotent: safe to re-run without side effects.

  gemini_nx_prompt: |
    Write comprehensive tests using vitest + @nx/devkit/testing.
    Use createTreeWithEmptyWorkspace() for isolated generator tests.
    Mock wrangler CLI for executor tests (never run real deploys in tests).
    Create snapshot tests for all generated file outputs.
    Test error paths: invalid configs, missing bindings, duplicate entries.

  copilot_nx_prompt: |
    Polish templates for readability and developer experience.
    Add JSONC comments in generated config files explaining each section.
    Write clear error messages that suggest fixes.
    Ensure generated code passes lint and follows project conventions.
    Add post-generation instructions that guide users to next steps.

# ─────────────────────────────────────────────────────────────────
# SUB-ISSUE SUMMARY (for GitHub issue creation)
# ─────────────────────────────────────────────────────────────────

sub_issue_count:
  NX-1: 24  # 6 parent issues × 4 sub-issues each
  NX-2: 20  # 5 parent issues × 4 sub-issues each
  NX-3: 20  # 5 parent issues × 4 sub-issues each
  NX-4: 32  # 8 parent issues × 4 sub-issues each
  total: 96

agent_distribution:
  claude: 24   # ~25% — specs, schemas, contracts
  codex: 26    # ~27% — implementation (some issues have 2 codex tasks)
  gemini: 28   # ~29% — testing (some issues have 2-3 test tasks)
  copilot: 22  # ~23% — DX, docs, polish
