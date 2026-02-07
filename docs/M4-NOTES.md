# M4 Notes

Date: 2026-02-07

## Cache TTL
- Search cache TTL is 24 hours (86400 seconds).

## Metrics Keys
- Search response cache key: `${tenantId}:search:${sha256(rewrittenQuery)}`
- Search latency metrics key: `${tenantId}:search:metrics:${timestamp}` (TTL 7 days)
- Cache check event key: `${tenantId}:search:cache-check:${timestamp}:${uuid}` (TTL 24 hours)
- Aggregated cache stats: computed on read via `getSearchCacheMetrics` and include `hitRate`, `latencyImprovement`, `topCachedQueries`

## Metrics Endpoint
- `GET /metrics/search-cache?period=1h|24h|7d` (default `24h`)
