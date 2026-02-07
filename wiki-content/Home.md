# Crispy Enigma Wiki

Welcome to the **Crispy Enigma** wiki — a comprehensive guide to building and deploying a multi-tenant Cloudflare Workers AI platform.

## 🎯 What is Crispy Enigma?

Crispy Enigma is a **production-ready multi-tenant AI monorepo** built on Cloudflare's edge infrastructure. It provides:

- 🤖 **Streaming AI Chat** with session persistence
- 🔍 **RAG (Retrieval-Augmented Generation)** search using Vectorize
- 🛠️ **Tool/Function Execution** system
- 🔐 **Strict tenant isolation** across all storage layers
- 📊 **Observability & Metrics** for monitoring
- 🚀 **Per-tenant deployments** with automated workflows

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Worker Entry Point                      │
│                    (apps/worker-api)                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  1. Tenant Resolution  →  2. Policy Checks  →  3. Routing    │
└───────────────────────┬───────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌────────┐    ┌──────────┐    ┌─────────┐
   │  Chat  │    │  Search  │    │  Tools  │
   └────┬───┘    └────┬─────┘    └────┬────┘
        │             │               │
        └─────────────┼───────────────┘
                      ▼
        ┌─────────────────────────────┐
        │     Cloudflare Primitives    │
        │  • Workers AI + AI Gateway   │
        │  • Vectorize (embeddings)    │
        │  • Durable Objects (state)   │
        │  • KV (cache + config)       │
        │  • D1 (metadata)             │
        └─────────────────────────────┘
```

## 📚 Quick Links

### Getting Started
- **[Getting Started](Getting-Started.md)** — Installation, setup, and first steps
- **[Architecture](Architecture.md)** — Deep dive into system design
- **[Development Guide](Development-Guide.md)** — Development workflow and tooling

### Core Concepts
- **[Multi-Tenancy](Multi-Tenancy.md)** — Tenant isolation patterns and best practices
- **[Security Best Practices](Security-Best-Practices.md)** — Security guidelines and patterns
- **[Testing Guide](Testing-Guide.md)** — Testing strategies and patterns

### Reference
- **[Milestones](Milestones.md)** — Project roadmap and completed milestones
- **[Troubleshooting](Troubleshooting.md)** — Common issues and solutions
- **[API Reference](API-Reference.md)** — Endpoint documentation

## 🎯 Current Status

**Latest Milestone:** M1 ✅ Complete (Streaming Chat + Sessions)  
**Next Milestone:** M2 🔵 In Progress (AI Gateway Integration)

### Completed Milestones

- ✅ **M0** — Foundation + tenant resolution
- ✅ **M1** — Streaming chat + sessions

### In Progress

- 🔵 **M2** — AI Gateway integration

See **[Milestones](Milestones.md)** for the full roadmap.

## 🚀 Key Features

### Streaming Chat (M1)
- Server-Sent Events (SSE) streaming
- Session persistence with Durable Objects
- Rate limiting per tenant/user
- KV cache layer
- Configurable retention policies

### Multi-Tenant Architecture (M0)
- Strict tenant isolation at all layers
- Explicit tenant parameters (no hidden context)
- Tenant-scoped storage adapters
- Per-tenant configuration and deployments

### Coming Soon
- AI Gateway integration (M2)
- RAG search with Vectorize (M3-M4)
- Tool execution system (M5)
- Observability layer (M7)

## 🛠️ Technology Stack

- **Runtime:** Cloudflare Workers (TypeScript, ES2022+)
- **Monorepo:** Nx workspace with npm
- **AI Models:** Workers AI (Llama, BGE embeddings)
- **Storage:** KV, Durable Objects, Vectorize, D1
- **Validation:** Zod schemas
- **Testing:** Vitest + Miniflare
- **Deployment:** Wrangler 4.63.0

## 📖 Documentation Structure

```
wiki-content/
├── Home.md (this page)
├── Architecture.md
├── Getting-Started.md
├── Multi-Tenancy.md
├── Development-Guide.md
├── Testing-Guide.md
├── Security-Best-Practices.md
├── API-Reference.md
├── Troubleshooting.md
├── Milestones.md
└── References.md
```

## 🤝 Contributing

This project follows strict patterns for tenant isolation and security. Before contributing:

1. Read **[Multi-Tenancy](Multi-Tenancy.md)** to understand tenant boundaries
2. Review **[Security Best Practices](Security-Best-Practices.md)**
3. Follow the **[Development Guide](Development-Guide.md)** workflow
4. Write tests (see **[Testing Guide](Testing-Guide.md)**)

## 📝 License

See [LICENSE](https://github.com/rainbowkillah/crispy-enigma/blob/main/LICENSE) in the repository.

---

**Need help?** Check the **[Troubleshooting](Troubleshooting.md)** page or review the **[References](References.md)** for more resources.
