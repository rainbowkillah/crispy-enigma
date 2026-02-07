# Getting Started

This guide will help you set up and run the Crispy Enigma multi-tenant AI platform locally.

## Prerequisites

- **Node.js**: v18+ (recommended: v20+)
- **npm**: 11.9.0 or higher
- **Git**: For cloning the repository
- **Cloudflare Account** (optional for deployment)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/rainbowkillah/crispy-enigma.git
cd crispy-enigma
```

### 2. Install Dependencies

```bash
npm install
```

This installs all dependencies for the monorepo, including:
- TypeScript
- Vitest (testing)
- Wrangler (Cloudflare CLI)
- ESLint + Prettier
- Nx (task orchestration)

### 3. Verify Installation

Run the test suite to ensure everything is working:

```bash
npm test
```

You should see all tests passing:
```
Test Files: 12 passed (12)
Tests:      36 passed (36)
Duration:   ~800ms
```

### 4. Type Check

Verify TypeScript compilation:

```bash
npm run typecheck
```

## Project Structure

```
crispy-enigma/
├── apps/
│   └── worker-api/          # Main API Worker
│       ├── src/
│       │   ├── index.ts          # Entry point
│       │   ├── session-do.ts     # ChatSession Durable Object
│       │   └── rate-limiter-do.ts # RateLimiter Durable Object
│       └── project.json
├── packages/
│   ├── core/                # Core types, tenant resolution
│   ├── storage/             # KV/DO/Vectorize adapters
│   ├── ai/                  # AI Gateway wrapper
│   ├── rag/                 # RAG pipeline (M3)
│   └── observability/       # Metrics & logging (M7)
├── tenants/                 # Per-tenant configuration
│   ├── demo/
│   │   ├── tenant.config.json
│   │   └── wrangler.jsonc
│   └── index.ts             # Auto-generated tenant index
├── tests/                   # Unit & integration tests
├── scripts/                 # Dev tooling
└── docs/                    # Documentation
```

## Running Locally

### Start the Development Server

Run the Worker locally using Wrangler dev:

```bash
npm run dev -- --tenant=demo
```

This starts the Worker on `http://localhost:8787` with the `demo` tenant configuration.

**What this does:**
- Loads `tenants/demo/wrangler.jsonc`
- Applies `tenants/demo/tenant.config.json`
- Starts Miniflare for local emulation
- Enables hot reloading

### Test the Health Endpoint

```bash
curl http://localhost:8787/health
```

Expected response:
```json
{
  "status": "ok",
  "tenant": "demo",
  "timestamp": "2026-02-07T02:54:43.997Z",
  "requestId": "..."
}
```

### Test the Chat Endpoint

Send a chat request:

```bash
npm run chat:dev -- --tenant=demo --message="Hello, how are you?"
```

Or manually:

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Tell me about multi-tenant architecture",
    "stream": true
  }'
```

**Streaming Response (SSE):**
```
event: token
data: {"token":"Multi"}

event: token
data: {"token":"-tenant"}

event: done
data: {"usage":{"promptTokens":50,"completionTokens":100}}
```

## Configuration

### Tenant Configuration

Each tenant has two config files:

**1. tenant.config.json** — Business logic configuration
```json
{
  "tenantId": "demo",
  "accountId": "your-cloudflare-account-id",
  "aiGatewayId": "demo-gateway",
  "aiModels": {
    "chat": "@cf/meta/llama-3.1-8b-instruct",
    "embeddings": "@cf/baai/bge-base-en-v1.5"
  },
  "vectorizeNamespace": "demo-embeddings",
  "rateLimit": {
    "perMinute": 100,
    "burst": 20
  },
  "sessionRetentionDays": 30,
  "maxMessagesPerSession": 1000
}
```

**2. wrangler.jsonc** — Cloudflare bindings
```jsonc
{
  "name": "worker-api-demo",
  "main": "src/index.ts",
  "compatibility_date": "2024-02-15",
  "durable_objects": {
    "bindings": [
      {
        "name": "CHAT_SESSION",
        "class_name": "ChatSession",
        "script_name": "worker-api-demo"
      },
      {
        "name": "RATE_LIMITER_DO",
        "class_name": "RateLimiter",
        "script_name": "worker-api-demo"
      }
    ]
  },
  "kv_namespaces": [
    { "binding": "CONFIG", "id": "..." },
    { "binding": "CACHE", "id": "..." },
    { "binding": "RATE_LIMITER", "id": "..." }
  ],
  "vectorize": [
    {
      "binding": "VECTORIZE",
      "index_name": "demo-embeddings"
    }
  ],
  "ai": { "binding": "AI" }
}
```

### Environment Variables

For production deployments, set secrets using Wrangler:

```bash
wrangler secret put API_KEY --env production
wrangler secret put OPENAI_API_KEY --env production
```

**Never commit secrets to the repository!**

## Available Commands

### Development
```bash
npm run dev -- --tenant=<name>        # Start local dev server
npm run chat:dev -- --tenant=<name> --message="..."  # Test chat endpoint
npm run smoke:dev -- --tenant=<name>  # Run smoke tests
```

### Testing
```bash
npm test                              # Run all tests
npm run test:watch                    # Run tests in watch mode
```

### Code Quality
```bash
npm run typecheck                     # TypeScript compilation
npm run lint                          # ESLint
npm run format                        # Prettier
```

### Utilities
```bash
npm run tenants:generate              # Regenerate tenant index
```

## Next Steps

Now that you have the project running locally:

1. **[Architecture](Architecture.md)** — Understand the system design
2. **[Multi-Tenancy](Multi-Tenancy.md)** — Learn tenant isolation patterns
3. **[Development Guide](Development-Guide.md)** — Development workflow
4. **[API Reference](API-Reference.md)** — Explore available endpoints

## Common Issues

### Port Already in Use

If port 8787 is in use:
```bash
npm run dev -- --tenant=demo --port=8788
```

### Binding Errors

If you see binding errors (KV, DO, Vectorize), ensure:
1. You're using the correct tenant name
2. The tenant's `wrangler.jsonc` is properly configured
3. Miniflare is installed correctly

See **[Troubleshooting](Troubleshooting.md)** for more solutions.

## Help & Support

- **Issues:** Check [Troubleshooting](Troubleshooting.md)
- **Patterns:** Review [Multi-Tenancy](Multi-Tenancy.md)
- **Security:** Read [Security Best Practices](Security-Best-Practices.md)
