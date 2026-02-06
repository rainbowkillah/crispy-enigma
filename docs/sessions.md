# Chat Sessions

Chat session state is stored in a Durable Object named `ChatSession`.

## Durable Object API

Internal endpoints:

- `POST /append`
  - Body: `{ role, content, tokenCount?, retentionDays?, maxMessages? }`
  - Appends a message and enforces retention.
- `GET /history`
  - Optional body: `{ limit?, retentionDays?, maxMessages? }`
  - Returns messages newest-first.
- `DELETE /clear`
  - Clears session history.

## Retention Policy

- Messages older than `sessionRetentionDays` are pruned.
- Sessions keep at most `maxMessagesPerSession` messages.
- Defaults: 30 days, 1000 messages.

## Tenant Scoping

Durable Object IDs are tenant-scoped:

```
${tenantId}:${sessionId}
```
