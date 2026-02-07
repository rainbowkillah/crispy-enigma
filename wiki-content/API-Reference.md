# API Reference

API documentation for the Crispy Enigma platform endpoints.

## Base URL

```
Development: http://localhost:8787
Production:  https://your-worker.your-account.workers.dev
```

## Authentication

All requests must include tenant identification using one of:

1. **Header** (recommended):
```http
x-tenant-id: demo
```

2. **Host mapping**:
```http
Host: demo.example.com
```

3. **API Key**:
```http
x-api-key: your-api-key-here
```

## Common Headers

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes (for POST) | `application/json` |
| `x-tenant-id` | Conditional | Tenant identifier |
| `x-api-key` | Conditional | API key for authentication |

### Response Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` or `text/event-stream` |
| `x-request-id` | Unique request identifier for tracing |
| `x-ratelimit-limit` | Maximum requests per minute |
| `x-ratelimit-remaining` | Remaining requests in current window |
| `retry-after` | Seconds to wait before retrying (429 only) |

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "details": {}  // Optional additional context
}
```

### Common Error Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Bad Request | Invalid input or missing required field |
| 401 | Unauthorized | Invalid or missing API key |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

---

## Endpoints

### Health Check

Check API health and tenant configuration.

```http
GET /health
```

#### Request

```bash
curl http://localhost:8787/health \
  -H "x-tenant-id: demo"
```

#### Response

```json
{
  "status": "ok",
  "tenant": "demo",
  "timestamp": "2026-02-07T02:54:43.997Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### Chat (Streaming)

Send a message and receive streaming AI response.

```http
POST /chat
Content-Type: application/json
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string (UUID) | Yes | Session identifier |
| `message` | string | Yes | User message (1-10000 chars) |
| `stream` | boolean | No | Enable streaming (default: true) |

#### Request Example

```bash
curl -X POST http://localhost:8787/chat \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: demo" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "What is multi-tenant architecture?",
    "stream": true
  }'
```

#### Response (Streaming)

**Content-Type:** `text/event-stream`

```
event: token
data: {"token":"Multi"}

event: token
data: {"token":"-tenant"}

event: token
data: {"token":" architecture"}

event: done
data: {"usage":{"promptTokens":50,"completionTokens":100}}
```

#### Response (Non-Streaming)

**Content-Type:** `application/json`

```json
{
  "response": "Multi-tenant architecture is a software design pattern...",
  "usage": {
    "promptTokens": 50,
    "completionTokens": 100
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Error Responses

**400 Bad Request** — Invalid input
```json
{
  "error": "Validation error",
  "requestId": "...",
  "details": {
    "issues": [
      {
        "path": ["sessionId"],
        "message": "Invalid UUID format"
      }
    ]
  }
}
```

**429 Too Many Requests** — Rate limit exceeded
```json
{
  "error": "Rate limit exceeded",
  "requestId": "..."
}
```

---

### Get Session History

Retrieve conversation history for a session.

```http
GET /chat/:sessionId/history
```

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | string (UUID) | Session identifier |

#### Request Example

```bash
curl http://localhost:8787/chat/550e8400-e29b-41d4-a716-446655440000/history \
  -H "x-tenant-id: demo"
```

#### Response

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": 1707271200000
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help you today?",
      "timestamp": 1707271201000
    },
    {
      "role": "user",
      "content": "What is multi-tenant architecture?",
      "timestamp": 1707271250000
    },
    {
      "role": "assistant",
      "content": "Multi-tenant architecture is...",
      "timestamp": 1707271252000
    }
  ],
  "requestId": "550e8400-e29b-41d4-a716-446655440001"
}
```

#### Error Responses

**404 Not Found** — Session not found
```json
{
  "error": "Session not found",
  "requestId": "..."
}
```

---

### Delete Session

Clear session history.

```http
DELETE /chat/:sessionId
```

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | string (UUID) | Session identifier |

#### Request Example

```bash
curl -X DELETE http://localhost:8787/chat/550e8400-e29b-41d4-a716-446655440000 \
  -H "x-tenant-id: demo"
```

#### Response

```json
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "requestId": "550e8400-e29b-41d4-a716-446655440002"
}
```

#### Error Responses

**404 Not Found** — Session not found
```json
{
  "error": "Session not found",
  "requestId": "..."
}
```

---

## Rate Limiting

Rate limits are enforced per tenant with the following defaults:

- **Requests per minute:** 100
- **Burst capacity:** 20

### Rate Limit Headers

All responses include rate limit information:

```http
x-ratelimit-limit: 100
x-ratelimit-remaining: 95
x-ratelimit-reset: 1707271260
```

### Rate Limit Exceeded

When rate limit is exceeded, the API returns `429 Too Many Requests`:

```json
{
  "error": "Rate limit exceeded",
  "requestId": "..."
}
```

**Headers:**
```http
retry-after: 60
x-ratelimit-limit: 100
x-ratelimit-remaining: 0
```

### Rate Limit Keying

Rate limits are scoped by:
1. Tenant ID
2. User ID (if authenticated)
3. Client IP address

Example rate limit key: `tenant-a:user-123:192.168.1.1`

---

## Streaming Protocol

### Server-Sent Events (SSE)

Streaming responses use SSE format:

```
event: <event-type>
data: <json-payload>

```

### Event Types

| Event | Description | Payload |
|-------|-------------|---------|
| `token` | Individual token from AI model | `{"token":"word"}` |
| `done` | Stream complete with usage stats | `{"usage":{...}}` |
| `error` | Error during streaming | `{"error":"message"}` |

### Client Example (JavaScript)

```javascript
const eventSource = new EventSource('/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': 'demo'
  },
  body: JSON.stringify({
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    message: 'Hello',
    stream: true
  })
});

eventSource.addEventListener('token', (event) => {
  const data = JSON.parse(event.data);
  console.log(data.token);
});

eventSource.addEventListener('done', (event) => {
  const data = JSON.parse(event.data);
  console.log('Usage:', data.usage);
  eventSource.close();
});

eventSource.addEventListener('error', (event) => {
  console.error('Stream error:', event);
  eventSource.close();
});
```

---

## Upcoming Endpoints

### M3-M4: Search (RAG)

```http
POST /search
Content-Type: application/json
```

**Request:**
```json
{
  "query": "What is tenant isolation?",
  "topK": 5
}
```

**Response:**
```json
{
  "answer": "Tenant isolation is...",
  "sources": [
    {
      "documentId": "doc-1",
      "chunk": "Tenant isolation ensures...",
      "score": 0.95
    }
  ],
  "confidence": 0.92,
  "followUps": [
    "How does Vectorize implement tenant isolation?",
    "What are the security implications?"
  ],
  "requestId": "..."
}
```

### M5: Tool Execution

```http
POST /tools/execute
Content-Type: application/json
```

**Request:**
```json
{
  "tool": "summarize",
  "args": {
    "text": "Long document to summarize...",
    "maxLength": 200
  }
}
```

**Response:**
```json
{
  "result": "Summary of the document...",
  "toolName": "summarize",
  "executionTime": 1234,
  "requestId": "..."
}
```

### M6: Text-to-Speech

```http
POST /tts
Content-Type: application/json
```

**Request:**
```json
{
  "text": "Hello, this is a test.",
  "voice": "en-US-Neural2-A",
  "format": "mp3"
}
```

**Response:**
```json
{
  "audioUrl": "https://...",
  "duration": 2.5,
  "format": "mp3",
  "requestId": "..."
}
```

---

## Best Practices

### 1. Always Include Request ID

Save the `x-request-id` header for debugging:

```javascript
const response = await fetch('/chat', options);
const requestId = response.headers.get('x-request-id');
console.log('Request ID:', requestId);
```

### 2. Handle Rate Limits

Implement exponential backoff:

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    
    if (response.status !== 429) {
      return response;
    }
    
    const retryAfter = response.headers.get('retry-after');
    await sleep(retryAfter * 1000);
  }
  
  throw new Error('Max retries exceeded');
}
```

### 3. Validate Input

Use Zod on client side:

```typescript
import { z } from 'zod';

const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  stream: z.boolean().optional().default(true),
});

// Before sending request
const validated = ChatRequestSchema.parse(userInput);
```

### 4. Handle Streaming Errors

Always handle stream errors:

```javascript
eventSource.addEventListener('error', (event) => {
  console.error('Stream error:', event);
  eventSource.close();
  
  // Fallback to non-streaming
  fetchNonStreaming();
});
```

---

## Links

- **[Getting Started](Getting-Started.md)** — Setup and first request
- **[Development Guide](Development-Guide.md)** — Development workflow
- **[Testing Guide](Testing-Guide.md)** — API testing
- **[Troubleshooting](Troubleshooting.md)** — Common API issues
