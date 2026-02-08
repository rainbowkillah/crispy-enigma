# M5 Tool/Function Execution System — API Reference

## Overview

The tool execution system provides 5 built-in tools that the AI can invoke to process text. Tools can be called two ways:

1. **Standalone** — `POST /tools/execute` with `tool_name` and `params`
2. **Chat-integrated** — `POST /chat` with `tool_name` and `tool_params` fields; the tool result is injected as context before the LLM response

## Endpoints

### `POST /tools/execute`

Direct tool execution.

**Request body:**
```json
{
  "tool_name": "summarize",
  "params": { "text": "..." },
  "user_id": "optional-user-id"
}
```

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "success": true,
    "data": { "summary": "...", "format": "paragraph" },
    "metadata": { "durationMs": 342 }
  }
}
```

**Error codes:** `TOOL_NOT_FOUND` (404), `VALIDATION_FAILED` (400), `PERMISSION_DENIED` (403), `EXECUTION_TIMEOUT` (500), `EXECUTION_ERROR` (500)

### `GET /schema/tools`

Returns all registered tool definitions (without handler functions).

**Response:**
```json
{
  "ok": true,
  "data": {
    "tools": [
      {
        "name": "summarize",
        "description": "Summarize text into a concise format",
        "parameters": { "type": "object", "properties": {...}, "required": ["text"] },
        "output": { "type": "object", "properties": {...} },
        "timeout": 30000
      }
    ]
  }
}
```

### `GET /metrics/tools/execution`

Aggregated tool execution metrics.

**Query params:** `period` — `1h`, `24h` (default), `7d`

**Response:**
```json
{
  "ok": true,
  "data": {
    "tenantId": "example",
    "period": "24h",
    "totalExecutions": 42,
    "successCount": 40,
    "errorCount": 2,
    "avgDurationMs": 350,
    "totalTokensUsed": 12000,
    "byTool": {
      "summarize": { "executions": 20, "successCount": 19, "errorCount": 1, "avgDurationMs": 400 }
    }
  }
}
```

### `POST /chat` (modified)

Now accepts optional `tool_name` and `tool_params`. When present, the tool is executed first and its result is injected as a system message before the LLM generates a response.

```json
{
  "sessionId": "uuid",
  "message": "Summarize this for me",
  "tool_name": "summarize",
  "tool_params": { "text": "Long document text..." }
}
```

## Built-in Tools

### `summarize`
Summarize text into a concise format.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Text to summarize (1–100,000 chars) |
| `max_length` | integer | no | Max summary length in chars (50–5000, default 500) |
| `format` | string | no | `paragraph` (default) or `bullet_points` |

**Output:** `{ summary: string, format: string }`
**Timeout:** 30s

### `extract_entities`
Extract named entities from text.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Text to extract from (1–100,000 chars) |
| `entity_types` | string[] | no | Filter to specific types (e.g. `["person", "location"]`) |

**Output:** `{ entities: [{text, type, start_offset, end_offset}], count: number }`
**Timeout:** 30s

### `classify_intent`
Classify the intent of a message.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Text to classify (1–10,000 chars) |
| `categories` | string[] | no | Custom categories (default: question, request, complaint, feedback, greeting, other) |

**Output:** `{ intent: string, confidence: number, categories_considered: string[] }`
**Timeout:** 30s

### `tag_chunk_docs`
Chunk a document and tag each chunk with topic labels.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | yes | Document content (1–500,000 chars) |
| `chunk_size` | integer | no | Max chunk size (100–10,000 chars) |
| `metadata` | object | no | Additional metadata |

**Output:** `{ chunks: [{index, text, tags, start_offset, end_offset}], chunk_count: number }`
**Timeout:** 30s

### `ingest_docs`
Ingest a document into the vector store (chunk → embed → upsert).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | yes | Document content (1–500,000 chars) |
| `doc_id` | string | yes | Unique document ID (1–256 chars) |
| `source` | string | no | Source identifier |
| `title` | string | no | Document title |
| `chunk_size` | integer | no | Max chunk size (100–10,000 chars) |
| `metadata` | object | no | Additional metadata stored with vectors |

**Output:** `{ doc_id: string, chunks_ingested: number, embedding_model: string }`
**Timeout:** 60s

## Permission Model

Tool access is controlled via tenant feature flags:

| Flag | Effect |
|------|--------|
| `tools_enabled: false` | Disables all tools for the tenant |
| `tool_{name}: false` | Disables a specific tool (e.g. `tool_summarize: false`) |
| Custom permissions | Tools can declare `permissions: ["can_ingest"]`; denied if the flag is `false` |

Default: all tools are allowed unless explicitly restricted.

## Audit Logging

Every tool execution is recorded to CACHE KV:
- **Key pattern:** `{tenantId}:tools:audit:{timestamp}:{uuid}`
- **TTL:** 7 days
- **Fields:** tenantId, toolName, requestId, userId, paramsHash (SHA-256, no PII), success, durationMs, errorCode, timestamp

## Metrics

Execution metrics are recorded per-call to CACHE KV:
- **Key pattern:** `{tenantId}:tools:metrics:{timestamp}:{uuid}`
- **TTL:** 7 days
- **Aggregated via:** `GET /metrics/tools/execution?period=1h|24h|7d`

## Architecture

```
Request → Worker API
  ├── POST /tools/execute → dispatchTool() → audit + metrics → Response
  ├── POST /chat (with tool_name) → dispatchTool() → inject result → LLM → Response
  ├── GET /schema/tools → listTools() → Response
  └── GET /metrics/tools/execution → getToolMetrics() → Response

dispatchTool():
  1. Registry lookup (getTool)
  2. Parameter validation (validateToolParameters)
  3. Permission check (checkToolPermission)
  4. Execute with timeout (Promise.race)
  5. Return DispatchResult
```
