import type { Env } from '../../core/src/env';

export type SearchCacheMetrics = {
  tenantId: string;
  period: '1h' | '24h' | '7d';
  startTime: number;
  endTime: number;
  totalSearches: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  latencyImprovement: number;
  topCachedQueries: Array<{ queryHash: string; hits: number }>;
};

type CacheCheckEvent = {
  timestamp: number;
  hit: boolean;
  latencyMs: number;
  queryHash: string;
};

const cacheCheckPrefix = ':search:cache-check:';

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function getWindowMs(period: SearchCacheMetrics['period']): number {
  switch (period) {
    case '1h':
      return 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '24h':
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function parseTimestampFromKey(key: string): number | null {
  const match = key.match(/:search:cache-check:(\d+):/);
  if (!match) {
    return null;
  }
  const timestamp = Number(match[1]);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function getSearchCacheMetrics(
  tenantId: string,
  period: SearchCacheMetrics['period'],
  env: Env
): Promise<SearchCacheMetrics> {
  const endTime = Date.now();
  const startTime = endTime - getWindowMs(period);
  const prefix = `${tenantId}${cacheCheckPrefix}`;

  if (!env.CACHE?.list || !env.CACHE?.get) {
    return {
      tenantId,
      period,
      startTime,
      endTime,
      totalSearches: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRate: 0,
      latencyImprovement: 0,
      topCachedQueries: []
    };
  }

  let cursor: string | undefined;
  const events: CacheCheckEvent[] = [];
  while (true) {
    const list = await env.CACHE.list({ prefix, cursor });
    const listCursor = (list as { cursor?: string }).cursor;
    const listComplete = (list as { list_complete?: boolean }).list_complete;
    for (const key of list.keys) {
      const timestamp = parseTimestampFromKey(key.name);
      if (!timestamp || timestamp < startTime || timestamp > endTime) {
        continue;
      }
      const raw = await env.CACHE.get(key.name);
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as CacheCheckEvent;
        events.push(parsed);
      } catch {
        // Ignore invalid records.
      }
    }
    if (listComplete || !listCursor) {
      break;
    }
    cursor = listCursor;
  }

  const totalSearches = events.length;
  const hits = events.filter((event) => event.hit);
  const misses = events.filter((event) => !event.hit);
  const cachedLatencies = hits.map((event) => event.latencyMs);
  const uncachedLatencies = misses.map((event) => event.latencyMs);
  const hitRate = totalSearches > 0 ? hits.length / totalSearches : 0;
  const latencyImprovement =
    percentile(uncachedLatencies, 0.95) - percentile(cachedLatencies, 0.95);

  const hitCounts = new Map<string, number>();
  for (const event of hits) {
    hitCounts.set(event.queryHash, (hitCounts.get(event.queryHash) ?? 0) + 1);
  }
  const topCachedQueries = Array.from(hitCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([queryHash, hitsCount]) => ({ queryHash, hits: hitsCount }));

  return {
    tenantId,
    period,
    startTime,
    endTime,
    totalSearches,
    cacheHits: hits.length,
    cacheMisses: misses.length,
    hitRate,
    latencyImprovement,
    topCachedQueries
  };
}
