# AI Gateway Integration

This document describes how the Worker routes all AI calls through Cloudflare AI Gateway, how models are selected, and how usage/budget signals are collected.

## Overview

All model requests use `env.AI.run()` with a `gateway` parameter. This ensures:
- Tenant attribution in AI Gateway analytics.
- Centralized policy enforcement.
- Consistent observability and cost signals.

## Gateway Options

Gateway routing is configured by `packages/ai/src/gateway.ts`:

```ts
env.AI.run(modelId, { messages }, {
  gateway: {
    id: tenant.aiGatewayId,
    metadata: {
      tenantId,
      traceId,
      sessionId,
      route: '/chat'
    }
  },
  stream: true
});
```

Metadata keys are filtered to non-empty strings. `tenantId` is always injected.

## Model Selection

Precedence for model selection:
1. `request.modelId` (per-request override)
2. `env.MODEL_ID` (environment override)
3. `tenant.aiModels.chat` (tenant default)

Fallback model:
- `env.FALLBACK_MODEL_ID` if provided
- otherwise `tenant.aiModels.chat`

If `featureFlags.modelAllowList` is enabled, the selected model must be present in `tenant.allowedModels`. If the fallback model is not allowed, it is disabled.

## Streaming Behavior

Streaming responses are normalized into a token stream via `aiStreamToTokenStream()` and delivered as SSE events.

When streaming:
- `x-model-id` header reflects the requested model.
- The final `event: done` payload includes usage metrics (modelId, tokens, latency) when available.
- `x-tokens-in` is an estimate based on input length.

See `docs/streaming.md` for SSE payload details.

## Usage Metrics

`runGatewayChat()` collects:
- `latencyMs` per request
- `tokensIn`, `tokensOut`, `totalTokens` when available

If token counts are not returned by the provider, lightweight estimates are used based on character length.

Non-streaming responses include headers:
- `x-model-id`
- `x-tokens-in`, `x-tokens-out`, `x-tokens-total`
- `x-ai-latency-ms`

## Budget Enforcement

Per-tenant token budgets are optional. Configure in `tenant.config.json`:

```json
{
  "tokenBudget": {
    "daily": 50000,
    "monthly": 1000000
  }
}
```

When a budget is set:
- Usage counters are stored in KV under `token-usage:daily` and `token-usage:monthly`.
- Requests that exceed the budget are rejected with `budget_exceeded` (HTTP 429).

## Authenticated Gateways (Optional)

Authenticated AI Gateway is used for external clients calling Gateway directly. The Worker does not need the token when using the `env.AI` binding, but you can store it locally for reference:

- `.env` (per tenant, ignored by git)
- `CF_AIG_TOKEN=...`

For production, use `wrangler secret put CF_AIG_TOKEN`.

## Preview Domain Format (Dev)

`<worker-name>-<env>.<tenant>.workers.dev`  
Example: `bluey-ai-worker-dev.mrrainbowsmoke.workers.dev`

## References

- `packages/ai/src/gateway.ts`
- `apps/worker-api/src/index.ts`
- `docs/ai-gateway-fallbacks.md`
