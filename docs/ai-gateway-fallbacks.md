# AI Gateway Fallback Behavior

This document describes the fallback behavior used when AI Gateway requests fail or responses change shape.

## Model Fallback

If a primary model call fails, the Worker retries with a fallback model (if configured):
- Primary: selected by request/env/tenant precedence
- Fallback: `env.FALLBACK_MODEL_ID` or `tenant.aiModels.chat`

If `featureFlags.modelAllowList` is enabled, fallback is only used when it is in `tenant.allowedModels`.

## Gateway Unavailable

If AI Gateway is unavailable or returns an error:
- Non-streaming requests return `ai_error` (HTTP 502).
- Streaming requests emit an `event: error` SSE frame:
  - `{ code: "ai_error", message: "AI provider unavailable", traceId }`

The stream still completes with a final `event: done`.

## Streaming Errors

If the client disconnects:
- Stream writes are ignored.
- The background worker safely closes the stream without throwing.

If the upstream stream terminates early:
- The Worker flushes any buffered tokens.
- The `done` event is still emitted to close the SSE contract.

## API Response Shape Changes

`extractTextResponse()` and token parsing handle multiple response shapes:
- Direct string response
- `{ response: string }`, `{ text: string }`, `{ content: string }`, `{ result: string }`
- OpenAI-style `{ choices: [{ message: { content } }] }`

If parsing fails, the Worker falls back to JSON stringification or raw text.

## Token Usage Availability

Token counts may not be available in streaming responses. When usage is missing:
- The Worker estimates token counts based on character length.
- Budget enforcement uses estimated input tokens pre-call and total tokens post-call.
