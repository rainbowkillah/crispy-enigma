# Documentation

Comprehensive documentation for the crispy-enigma multi-tenant AI chat platform.

## 📋 Quick Navigation

### Project Planning
- **[Project Status](./PROJECT-STATUS.md)** — Current milestone progress and roadmap
- **[Project Plan](./plan.md)** — Master plan and high-level strategy
- **[Quick Reference](./quick-reference.md)** — Common commands and patterns
- **[M5 Handoff](./handoff-M5.md)** — Claude handoff for M5 planning/architecture/implementation
- **[M8 Handoff](./handoff-M8.md)** — M8 completion summary and operational notes

### 🏗️ Architecture & Design
Core technical documentation describing system design and implementation.

- **[System Architecture](./architecture/architecture.md)** — Overall system design and components
- **[Multi-Tenancy](./architecture/tenancy.md)** — Tenant isolation, resolution, and scoping
- **[Cloudflare Bindings](./architecture/bindings.md)** — AI, KV, D1, Vectorize, Durable Objects configuration
- **[Failure Modes](./architecture/failure-modes.md)** — Known issues and mitigation strategies
- **[Anti-Patterns (Footguns)](./architecture/footguns.md)** — Common mistakes to avoid
- **[Observability & Metrics](./architecture/metrics.md)** — Logging, monitoring, and debugging

### 📚 Guides & How-To
User-facing guides for development, testing, and operations.

#### Getting Started
- **[Getting Started](./guides/getting-started.md)** — First steps for new developers
- **[Development Guide](./guides/development-guide.md)** — Setting up a local environment
- **[API Reference](./guides/api-reference.md)** — REST API endpoint documentation

#### Development & Testing
- **[Testing Guide](./guides/testing.md)** — Test strategy, patterns, and running tests
- **[AI Gateway Setup](./guides/ai-gateway.md)** — Configuring and using the AI Gateway
- **[AI Gateway Fallbacks](./guides/ai-gateway-fallbacks.md)** — Fallback behavior and error handling
- **[Streaming Implementation](./guides/streaming.md)** — Server-sent events and streaming responses
- **[Session Management](./guides/sessions.md)** — Chat session lifecycle and persistence

#### Operations
- **[Rate Limiting](./guides/rate-limiting.md)** — Rate limit configuration and behavior
- **[Vectorize Setup](./guides/vectorize-dev.md)** — Cloudflare Vectorize for embeddings
- **[Wrangler CLI](./guides/wrangler.md)** — Wrangler development and deployment
- **[Security Best Practices](./guides/security.md)** — Authentication, authorization, and secrets
- **[Troubleshooting](./guides/troubleshooting.md)** — Common issues and solutions
- **[Cross-Tenant References](./guides/references.md)** — Useful links and external resources
- **[Multi-Account Auth](./deployment/multi-account-auth.md)** — Per-tenant token strategy
- **[Rollback Runbook](./runbooks/rollback-deployment.md)** — Deployment rollback procedure
- **[Incident Response](./runbooks/incident-response.md)** — Incident management steps

### 🎯 Architecture Decision Records (ADRs)
Design decisions and rationale.

- **[ADR-001: SSE Streaming](./adrs/ADR-001-sse-streaming.md)** — Why server-sent events for streaming
- **[ADR-002: DO Namespaces](./adrs/ADR-002-separate-do-namespaces.md)** — Separate Durable Object classes for isolation
- **[ADR-003: Sliding Window Rate Limiting](./adrs/ADR-003-sliding-window-rate-limiting.md)** — Rate limiting algorithm design
- **[ADR-004: Model Selection Precedence](./adrs/ADR-004-model-selection-precedence.md)** — How AI models are selected

### 📝 Examples
Code examples and patterns.

- **[Tenant-Aware Handler](./examples/tenant-aware-handler.ts)** — Example request handler with tenant context
- **[Chat Endpoint Example](./examples/chat.md)** — Chat API usage patterns

### 🔧 Development Tooling
- **[Codex Prompts](./tooling/CODEX-PROMPTS.md)** — Prompts for automated code generation and refactoring

### 📦 Milestones
Status and documentation for project milestones.

#### Current
- **[M8 Status](./milestones/M8/STATUS.md)** — Completion results and validation
- **[M8 README](./milestones/M8/README.md)** — Scope, outcomes, and links
- **[M8 Planning Brief](./milestones/M8/PLANNING-BRIEF.md)** — Historical planning notes

#### Next
- **TBD** — Next milestone definition pending production validation

#### Archive
- **[Completed Milestones](./archive/milestones/)** — Documentation for M0, M1, M2, M3
- **[M5 Preparation](./milestones/M5/PREP.md)** — Historical planning and scope

## 🔍 Finding What You Need

| I want to... | Start here |
|---|---|
| Get started developing | [Development Guide](./guides/development-guide.md) |
| Understand the architecture | [System Architecture](./architecture/architecture.md) |
| Deploy to staging/production | [Wrangler CLI](./guides/wrangler.md) |
| Write tests | [Testing Guide](./guides/testing.md) |
| Add AI features | [AI Gateway Setup](./guides/ai-gateway.md) |
| Handle real-time chat | [Streaming Implementation](./guides/streaming.md) |
| Debug issues | [Troubleshooting](./guides/troubleshooting.md) |
| Check API endpoints | [API Reference](./guides/api-reference.md) |
| Understand tenant isolation | [Multi-Tenancy](./architecture/tenancy.md) |
| Review design decisions | [Architecture Decision Records](./adrs/) |

## 📊 Test Results & Validation
- **[M4 Results](./m4-results/)** — Test output and validation results

## Contributing
When adding new documentation:
1. Place architecture docs in `architecture/`
2. Place guides in `guides/`
3. Update this README with navigation links
4. Keep descriptions concise (1 line per doc)
5. Use consistent formatting and structure

## Agent Orchestration
For AI agent configuration, see [`agents.prompt.yaml`](./agents.prompt.yaml).
