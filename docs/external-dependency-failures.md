# External Dependency Failure Strategies

This document outlines strategies for handling failures of external dependencies, such as the AI Gateway, Vectorize, and Durable Objects.

## AI Gateway

The AI Gateway is a critical dependency for the chat and search endpoints. If the AI Gateway is unavailable, the following strategies can be used:

- **Fallback Model:** The `runGatewayChat` function in `packages/ai/src/gateway.ts` already supports a fallback model. If the primary model is unavailable, it will automatically fall back to the fallback model.
- **Circuit Breaker:** A circuit breaker can be implemented to prevent requests from being sent to the AI Gateway if it is known to be unavailable. This can help to reduce the load on the system and prevent cascading failures.
- **Caching:** The search endpoint already uses caching to reduce the number of requests to the AI Gateway. If the AI Gateway is unavailable, the cache can be used to serve stale results.

## Vectorize

Vectorize is a critical dependency for the search endpoint. If Vectorize is unavailable, the following strategies can be used:

- **Circuit Breaker:** A circuit breaker can be implemented to prevent requests from being sent to Vectorize if it is known to be unavailable.
- **Graceful Degradation:** If Vectorize is unavailable, the search endpoint can be gracefully degraded to a simpler search algorithm that does not rely on vector embeddings.

## Durable Objects

Durable Objects are used for session management and rate limiting. If a Durable Object is unavailable, the following strategies can be used:

- **Retry with Backoff:** The client can retry the request with an exponential backoff.
- **Graceful Degradation:** If the session management Durable Object is unavailable, the chat endpoint can be gracefully degraded to a stateless mode. If the rate limiting Durable Object is unavailable, the rate limiter can be temporarily disabled.