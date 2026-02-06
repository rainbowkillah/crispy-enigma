# ADR-001: Server-Sent Events for Chat Streaming

**Status:** Accepted
**Date:** 2026-02-06
**Milestone:** M1

## Context

The `/chat` endpoint needs to stream tokens progressively to clients. Two options were evaluated:

1. **Server-Sent Events (SSE)** — `text/event-stream` with `data:` lines
2. **Newline-delimited JSON (NDJSON)** — `application/x-ndjson` with chunked transfer encoding

## Decision

Use SSE (`text/event-stream`).

## Rationale

- Native browser support via `EventSource` API — no polyfills needed.
- Built-in reconnection semantics (`retry:` field).
- Cloudflare Workers support SSE natively with `TransformStream`.
- Compatible with all major HTTP clients (curl, fetch, axios).
- Clear event typing (`event: done`) for stream termination.

NDJSON was rejected because it requires manual reconnection logic and has no standard termination signal.

## Consequences

- Clients that cannot consume SSE must set `stream: false` and receive a buffered JSON response.
- The `done` event signals stream completion; clients must listen for it.
- Error events during streaming are sent as `event: error` with a JSON payload containing the trace ID.

## References

- [docs/streaming.md](../streaming.md) — full contract specification
- `apps/worker-api/src/index.ts` — SSE implementation
