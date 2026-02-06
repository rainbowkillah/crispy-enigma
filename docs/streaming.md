# Streaming Contract

This project uses Server-Sent Events (SSE) for `/chat` streaming responses.

## Request

`POST /chat` with:

```json
{
  "sessionId": "uuid",
  "message": "string",
  "stream": true
}
```

## Response

`Content-Type: text/event-stream`

Events are UTF-8 encoded lines with `data:` payloads. Payloads are JSON.

Example:

```
data: {"sessionId":"...","role":"assistant","content":"Hello","tenantId":"example","traceId":"..."}

event: done
data: {"done":true}

```

## Notes

- `traceId` is included when present on the request.
- Streaming is best-effort; clients should handle reconnects gracefully.
- Non-streaming requests set `"stream": false` and return JSON.
