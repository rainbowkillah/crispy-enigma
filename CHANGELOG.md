# Changelog

All notable changes for this project are documented here.

## 2026-02-07 (M2: AI Gateway Integration)

### Added
- `modelId` request override with precedence (request > env > tenant).
- Optional model allow-list enforcement via `featureFlags.modelAllowList`.
- Token usage tracking, latency metrics, and KV-backed budget checks.
- Usage headers for non-streaming responses and usage payload in SSE `done` events.
- AI Gateway integration documentation (`docs/ai-gateway.md`).
- AI Gateway fallback behavior documentation (`docs/ai-gateway-fallbacks.md`).
- ADR for model selection precedence (`docs/adrs/ADR-004-model-selection-precedence.md`).
- Token budget enforcement tests (`tests/token-budget.test.ts`).
- Model override tests (`tests/ai-gateway.test.ts`).

### Changed
- AI Gateway wrapper now emits usage metrics and estimates tokens when missing.
- Chat handler records token counts per message.
- Alpha tenant config includes token budget and allowed model list for validation coverage.
- AI Gateway example doc now uses placeholder tokens and .env reference.
