# Chat Examples (M1)

These examples target local dev (`wrangler dev`) and the M1 mock response. Make sure you run:

```bash
npm run dev -- --tenant=<tenant-name>
```

## Streaming chat (SSE)

```bash
curl -N http://127.0.0.1:8787/chat \
  -H "content-type: application/json" \
  -H "x-tenant-id: <tenant-name>" \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","message":"Hello","stream":true}'
```

Expected event lines (example):

```
data: {"sessionId":"...","role":"assistant","content":"Mock response. Streaming contract implemented in #16.","tenantId":"<tenant-name>","traceId":"..."}

event: done
data: {"done":true}
```

## Non-streaming chat

```bash
curl http://127.0.0.1:8787/chat \
  -H "content-type: application/json" \
  -H "x-tenant-id: <tenant-name>" \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","message":"Hello","stream":false}'
```

## Session history

```bash
curl http://127.0.0.1:8787/chat/11111111-1111-1111-1111-111111111111/history \
  -H "x-tenant-id: <tenant-name>"
```

## Clear session

```bash
curl -X DELETE http://127.0.0.1:8787/chat/11111111-1111-1111-1111-111111111111 \
  -H "x-tenant-id: <tenant-name>"
```
