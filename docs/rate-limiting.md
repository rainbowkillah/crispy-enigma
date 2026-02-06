# Rate Limiting

Rate limiting is enforced by a `RateLimiter` Durable Object per tenant + user key.
The current implementation uses a sliding window and is applied to `/chat`.

## Keying

Durable Object IDs are tenant-scoped:

```
${tenantId}:ratelimit:${userKey}
```

`userKey` is derived from the request body `userId`, or `x-user-id` header, or `anonymous`.

## Limits

- The limit value comes from `tenant.rateLimit.perMinute`.
- The window is currently fixed at `60` seconds.

If the request is over limit, the response is `429` with standard headers.

## Internal API

`POST /check` with:

```json
{
  "limit": 60,
  "windowSec": 60
}
```

Response:

```json
{
  "allowed": true,
  "remaining": 59,
  "resetAt": 1700000000000
}
```

Notes:
- `resetAt` is a unix epoch timestamp in milliseconds.
- When `allowed` is `false`, the timestamp list is not updated.

## Headers

`/chat` responses include:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

## Example

Request:

```bash
curl -s -X POST http://localhost:8787/chat \
  -H "content-type: application/json" \
  -H "x-tenant-id: example" \
  -H "x-user-id: user-123" \
  -d '{"sessionId":"11111111-1111-1111-1111-111111111111","message":"hello","stream":false}'
```

Over-limit response:

```json
{
  "ok": false,
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded"
  }
}
```
