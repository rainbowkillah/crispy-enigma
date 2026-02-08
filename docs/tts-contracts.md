# M6 TTS Adapter Boundary — API Reference

## Overview

The TTS (Text-to-Speech) adapter boundary provides a unified interface for generating speech from text. It is designed to support multiple providers (e.g., ElevenLabs, OpenAI, Cloudflare Workers AI) through a standardized adapter pattern.

Currently, a **Stub Adapter** is implemented, which acts as a placeholder and returns a standard error until a real provider is configured.

## Endpoints

### `POST /tts`

Generate speech from text.

**Request Body:**

```json
{
  "text": "Hello, world!",
  "voice": "en-US-Standard-A",
  "format": "mp3",
  "streaming": false,
  "speed": 1.0
}
```

| Field | Type | Required | Description | Default |
|-------|------|----------|-------------|---------|
| `text` | string | Yes | The text to convert to speech (1-5000 chars) | - |
| `voice` | string | No | The voice ID or name to use | Provider default |
| `format` | string | No | Audio format: `mp3`, `wav`, `opus` | `mp3` |
| `streaming` | boolean | No | Whether to stream the response | `false` |
| `speed` | number | No | Speech speed (0.25 - 4.0) | `1.0` |

**Response (200 - Success):**

- **Content-Type:** `audio/mpeg` (for mp3), `audio/wav`, or `audio/ogg` (for opus)
- **Body:** Binary audio data (or stream)

**Response (Error):**

```json
{
  "ok": false,
  "error": {
    "code": "tts_error",
    "message": "TTS provider not configured",
    "traceId": "..."
  }
}
```

**Common Error Codes:**

- `tts_not_enabled` (403): The `tts_enabled` feature flag is false for this tenant.
- `tts_error` (500): The TTS provider failed or is not configured.
- `invalid_request` (400): Validation failed (e.g., text too long).
- `method_not_allowed` (405): Only POST is supported.

## Feature Flags

Access to the TTS endpoint is controlled by the `tts_enabled` feature flag in the Tenant Config.

```json
{
  "featureFlags": {
    "tts_enabled": true
  }
}
```

If this flag is missing or `false`, the endpoint returns `403 Forbidden`.

## Adapter Interface

The system uses an adapter pattern to decouple the API from specific providers.

### `TtsAdapter` Interface

```typescript
export interface TtsAdapter {
  /**
   * Generates audio from the given request.
   */
  generate(request: TtsRequest, options?: { traceId?: string }): Promise<TtsResponse>;

  /**
   * Returns a list of available voice IDs.
   */
  getAvailableVoices(): Promise<string[]>;
}
```

### `TtsResponse`

```typescript
export interface TtsResponse {
  contentType: string;
  data: ReadableStream | Uint8Array;
  usage?: {
    characters: number;
    durationMs?: number;
  };
}
```

### Stub Implementation

The default `StubTtsAdapter` is used when no specific provider is configured.

- `generate()`: Throws "TTS provider not configured".
- `getAvailableVoices()`: Returns `[]`.

## Future Integration

To add a real provider (e.g., ElevenLabs):
1. Create a new adapter implementing `TtsAdapter` (e.g., `ElevenLabsAdapter`).
2. Update the factory logic in `apps/worker-api` to instantiate the correct adapter based on environment variables or tenant config.
