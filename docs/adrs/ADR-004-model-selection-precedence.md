# ADR-004: Model Selection Precedence and Allow-List Enforcement

**Status:** Accepted
**Date:** 2026-02-07
**Milestone:** M2

## Context

The platform supports multiple model configuration sources:
- Per-request overrides (client-specified model)
- Environment-level overrides (deployment specific)
- Tenant defaults in `tenant.config.json`

We need a deterministic precedence order, and a safe way to prevent tenants from invoking unapproved models.

## Decision

Model selection follows this precedence:
1. `request.modelId` (per-request override)
2. `env.MODEL_ID` (environment override)
3. `tenant.aiModels.chat` (tenant default)

Fallback model selection:
- `env.FALLBACK_MODEL_ID` if set
- otherwise `tenant.aiModels.chat`

If `featureFlags.modelAllowList` is enabled, the selected model must be in `tenant.allowedModels`. If the fallback model is not allowed, it is disabled.

## Rationale

- **Flexibility:** Request-level overrides allow experimentation or A/B tests without redeploys.
- **Operational control:** `env.MODEL_ID` allows per-environment overrides for staging/production.
- **Safety:** Tenant defaults ensure a consistent baseline when no overrides are specified.
- **Governance:** Allow-lists provide a safeguard against unintended model usage and cost spikes.

## Consequences

- Clients can specify `modelId` in `/chat` requests.
- Tenants can optionally enable `featureFlags.modelAllowList` with `allowedModels`.
- Requests using disallowed models return `403` with `model_not_allowed`.
- Fallbacks are skipped if not allowed, which can surface provider errors earlier.

## References

- [`apps/worker-api/src/index.ts`](../../apps/worker-api/src/index.ts) — model selection + allow-list checks
- [`packages/core/src/chat/schema.ts`](../../packages/core/src/chat/schema.ts) — `modelId` request field
- [`docs/ai-gateway.md`](../ai-gateway.md) — integration details
