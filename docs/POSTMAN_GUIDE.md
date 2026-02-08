# Postman Collection Guide

This guide explains how to import and use the Crispy Enigma API Postman collection.

## Importing the Collection

1. Open Postman
2. Click **Import** in the top left
3. Select the `postman-collection.json` file from this repository
4. Click **Import**

## Configuration

After importing, you need to configure the collection variables:

### Collection Variables

1. Click on the **Crispy Enigma API** collection
2. Go to the **Variables** tab
3. Update the following variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `baseUrl` | Your API base URL | `https://example.local` or `https://your-worker.workers.dev` |
| `tenantId` | Your tenant identifier | `example` |
| `sessionId` | Chat session UUID (auto-generated) | `550e8400-e29b-41d4-a716-446655440000` |
| `docId` | Document ID for ingestion | `doc-001` |

### Authentication

The collection uses the `x-tenant-id` header for tenant identification. You can also:

- **Use hostname-based routing**: Set your `baseUrl` to a tenant-specific domain
- **Use API keys**: Replace the `x-tenant-id` header with `x-api-key` if configured

## Available Endpoints

### 1. Health Check
- **GET** `/health`
- Check API status and tenant configuration
- No request body required

### 2. Metrics

#### Search Cache Metrics
- **GET** `/metrics/search-cache?period={1h|24h|7d}`
- Get cache performance metrics
- Query parameters:
  - `period`: Time window (1h, 24h, or 7d)

#### SLI Metrics (M7)
- **GET** `/metrics/slis?period={1h|24h|7d}&fresh={0|1}`
- Get Service Level Indicators for chat success rate, search accuracy, tool reliability, and latency
- Query parameters:
  - `period`: Time window (1h, 24h, or 7d)
  - `fresh`: Set to 1 to bypass cache

#### Anomaly Detection (M7)
- **GET** `/metrics/anomalies?period={1h|24h|7d}`
- Detect anomalies in system metrics using statistical analysis
- Query parameters:
  - `period`: Time window (1h, 24h, or 7d)

#### Alert Rules (M7)
- **GET** `/metrics/alerts?period={1h|24h|7d}`
- Get configured alert rules and their evaluation status
- **POST** `/metrics/alerts` - Create/update alert rules
- **DELETE** `/metrics/alerts?id={ruleId}` - Delete alert rule
- Query parameters:
  - `period`: Optional filter by period (1h, 24h, or 7d)
  - `id`: Alert rule ID (for DELETE)

#### Metrics Overview (M7)
- **GET** `/metrics/overview?period={1h|24h|7d}`
- Get aggregated dashboard view with SLIs, anomalies, and alerts
- Query parameters:
  - `period`: Time window (1h, 24h, or 7d)

#### Cost Metrics
- **GET** `/metrics/cost?period={1h|24h|7d}`
- Get cost metrics for AI operations (chat, embeddings, TTS)
- Query parameters:
  - `period`: Time window (1h, 24h, or 7d)
- Response includes:
  - Total cost
  - Breakdown by operation type (chat, embeddings, TTS)
  - Request counts and token/character usage

### 3. Ingest Document
- **POST** `/ingest`
- Add documents to the RAG system
- Request body:
```json
{
  "docId": "doc-001",
  "text": "Your document content here...",
  "source": "optional-source-name",
  "title": "Optional Document Title",
  "url": "https://optional-url.com",
  "chunking": {
    "maxChunkSize": 1000,
    "overlap": 100
  }
}
```

### 4. Search Documents
- **POST** `/search`
- Search documents with RAG
- Request body:
```json
{
  "query": "What are Cloudflare Workers?",
  "topK": 5,
  "filter": {
    "source": "optional-filter"
  }
}
```

### 5. Send Chat Message
- **POST** `/chat`
- Send a message in a chat session
- Request body:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Your message here",
  "stream": false,
  "modelId": "optional-model-id",
  "userId": "optional-user-id"
}
```
- Set `stream: true` for Server-Sent Events streaming

### 6. Get Chat History
- **GET** `/sessions/{sessionId}/history`
- Retrieve all messages from a session
- Replace `{sessionId}` with your session UUID

### 7. Clear Chat Session
- **DELETE** `/sessions/{sessionId}`
- Delete all messages in a session
- Replace `{sessionId}` with your session UUID

### 8. Text to Speech
- **POST** `/tts`
- Convert text to speech audio
- Request body:
```json
{
  "text": "Text to convert to speech",
  "voice": "alloy",
  "format": "mp3",
  "speed": 1.0,
  "streaming": false
}
```
- Supported formats: `mp3`, `wav`, `opus`
- Speed range: 0.25 to 4.0
- Max text length: 5000 characters
- Requires `tts_enabled` feature flag for tenant
- Returns audio data in specified format

## Usage Workflow

### Basic RAG Search Flow

1. **Ingest Documents**
   ```
   POST /ingest → Upload your documents
   ```

2. **Search**
   ```
   POST /search → Ask questions about your documents
   ```

### Chat Flow

1. **Start Chat** (auto-generates sessionId)
   ```
   POST /chat → Send first message
   ```

2. **Continue Conversation**
   ```
   POST /chat → Send more messages with same sessionId
   ```

3. **View History**
   ```
   GET /sessions/{sessionId}/history → See all messages
   ```

4. **Clear Session** (optional)
   ```
   DELETE /sessions/{sessionId} → Start fresh
   ```

## Pre-request Scripts

The collection includes pre-request scripts that:
- Auto-generate UUIDs for `sessionId` when not set
- Can be extended for custom authentication

## Tests

Each request includes automatic tests for:
- Response time (<5 seconds)
- Content-Type validation
- Basic response structure checks

## Newman (CLI)

Run the collection via Nx (recommended):

```bash
nx run worker-api:postman-perf
```

This uses:
- `postman-collection.json`
- `postman-env.staging.json`
- JSON report output: `docs/m4-results/newman-performance.json`

Note: Newman is a functional/latency check, not a full load test. For true performance testing, keep using the Postman Performance Runner.

## Environment Setup

For multiple environments (dev, staging, prod), create Postman environments:

1. Click **Environments** in the left sidebar
2. Create a new environment (e.g., "Development")
3. Add variables:
   - `baseUrl`: `https://dev-api.example.com`
   - `tenantId`: `dev-tenant`
4. Select the environment from the dropdown

## Streaming Responses

For streaming chat responses (`stream: true`):
1. The response uses Server-Sent Events (SSE)
2. Postman may not display streaming data properly
3. Consider using:
   - `curl` for testing streaming
   - EventSource API in browser
   - Streaming-aware tools

Example with curl:
```bash
curl -X POST https://example.local/chat \
  -H "x-tenant-id: example" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Hello!",
    "stream": true
  }' \
  -N
```

## Error Responses

All errors follow this format:
```json
{
  "ok": false,
  "error": {
    "code": "error_code",
    "message": "Human-readable error message"
  },
  "traceId": "unique-trace-id"
}
```

Common error codes:
- `tenant_required`: Missing tenant identification
- `tenant_unknown`: Tenant not found
- `invalid_json`: Malformed JSON in request body
- `invalid_request`: Schema validation failed
- `rate_limited`: Too many requests
- `payload_too_large`: Request body exceeds size limit
- `method_not_allowed`: Wrong HTTP method
- `not_found`: Endpoint doesn't exist

## Rate Limiting

The API enforces rate limits per tenant. Check response headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

When rate limited, you'll receive a 429 status code.

## Tips

1. **Save Responses**: Right-click on a request → Add Example → Name it
2. **Use Variables**: Reference variables with `{{variableName}}`
3. **Chain Requests**: Use tests to set variables for subsequent requests
4. **Monitor API**: Use Postman Monitors to schedule API health checks

## Troubleshooting

### "Tenant required" error
- Verify `x-tenant-id` header is set
- Check collection variables are configured
- Ensure tenant exists in the system

### Session not found
- Generate a new UUID for `sessionId`
- Use the UUID from a successful chat response

### Invalid JSON
- Validate JSON syntax in request body
- Check for trailing commas
- Ensure proper quotes around strings

## Support

For issues or questions:
- Check [docs/guides/api-reference.md](docs/guides/api-reference.md)
- Review [docs/guides/troubleshooting.md](docs/guides/troubleshooting.md)
- Check application logs for trace IDs

---

**Collection Version:** 1.0  
**Last Updated:** February 7, 2026  
**API Version:** M2
