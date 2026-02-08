import type { Env } from '../../core/src/env';
import { getSearchCacheMetrics, type SearchCacheMetrics } from './metrics';
import { getCostMetrics } from './cost';

export type SliPeriod = '1h' | '24h' | '7d';

export type SearchSliSummary = {
  totalRequests: number;
  errorRate: number;
  latencyAvgMs: number;
  latencyP95Ms: number;
};

export type CacheSliSummary = SearchCacheMetrics;

export type ToolSliSummary = {
  totalExecutions: number;
  errorRate: number;
  avgDurationMs: number;
};

export type CostSliSummary = {
  totalCost: number;
  totalTokens: number;
};

export type SliSummary = {
  tenantId: string;
  period: SliPeriod;
  timestamp: number;
  search: SearchSliSummary;
  cache: CacheSliSummary;
  tools?: ToolSliSummary;
  cost: CostSliSummary;
};

export type SliHistoryEntry = {
  timestamp: number;
  metrics: Record<string, number>;
};

const PERIOD_MS: Record<SliPeriod, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
};

const SLI_CACHE_TTL_SECONDS = 300; // 5 minutes
const SLI_HISTORY_TTL_SECONDS = 604_800; // 7 days
const MAX_HISTORY_ENTRIES = 50;

export async function getSearchMetricsSummary(
  tenantId: string,
  period: SliPeriod,
  env: Env
): Promise<SearchSliSummary> {
  const summary: SearchSliSummary = {
    totalRequests: 0,
    errorRate: 0,
    latencyAvgMs: 0,
    latencyP95Ms: 0,
  };

  if (!env.CACHE?.list) {
    return summary;
  }

  const periodMs = PERIOD_MS[period] ?? PERIOD_MS['24h'];
  const cutoff = Date.now() - periodMs;
  const prefix = `${tenantId}:search:metrics:`;

  let cursor: string | undefined;
  let totalLatency = 0;
  let latencyCount = 0;
  let errorCount = 0;
  const latencies: number[] = [];

  do {
    const listResult = await env.CACHE.list({ prefix, cursor });
    const validKeys = listResult.keys.filter((key) => {
      const parts = key.name.split(':');
      const timestamp = Number(parts[3]);
      return timestamp >= cutoff;
    });

    const batchSize = 50;
    for (let i = 0; i < validKeys.length; i += batchSize) {
      const batch = validKeys.slice(i, i + batchSize);
      const values = await Promise.all(batch.map((key) => env.CACHE.get(key.name)));

      for (const raw of values) {
        if (!raw) {
          continue;
        }

        try {
          const entry = JSON.parse(raw) as {
            status?: string;
            latencies?: { totalMs?: number };
          };

          summary.totalRequests += 1;

          if (entry.status === 'error') {
            errorCount += 1;
          }

          const latency = entry.latencies?.totalMs;
          if (typeof latency === 'number' && Number.isFinite(latency)) {
            latencies.push(latency);
            totalLatency += latency;
            latencyCount += 1;
          }
        } catch {
          // ignore invalid entries
        }
      }
    }

    cursor = listResult.list_complete ? undefined : (listResult.cursor as string);
  } while (cursor);

  if (summary.totalRequests > 0) {
    summary.errorRate = errorCount / summary.totalRequests;
  }

  if (latencyCount > 0) {
    summary.latencyAvgMs = Math.round(totalLatency / latencyCount);
    latencies.sort((a, b) => a - b);
    summary.latencyP95Ms = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  }

  return summary;
}

export function flattenSliMetrics(summary: SliSummary): Record<string, number> {
  const metrics: Record<string, number> = {
    'search.error_rate': summary.search.errorRate,
    'search.latency_avg_ms': summary.search.latencyAvgMs,
    'search.latency_p95_ms': summary.search.latencyP95Ms,
    'cache.hit_rate': summary.cache.hitRate,
    'cache.avg_latency_ms': summary.cache.avgLatencyMs,
    'cost.total_usd': summary.cost.totalCost,
    'cost.total_tokens': summary.cost.totalTokens,
  };

  if (summary.tools) {
    metrics['tools.error_rate'] = summary.tools.errorRate;
    metrics['tools.avg_duration_ms'] = summary.tools.avgDurationMs;
    metrics['tools.total_executions'] = summary.tools.totalExecutions;
  }

  return metrics;
}

export async function getSliHistory(
  tenantId: string,
  period: SliPeriod,
  env: Env
): Promise<SliHistoryEntry[]> {
  if (!env.CACHE?.get) {
    return [];
  }
  const key = `${tenantId}:slis:history:${period}`;
  const raw = await env.CACHE.get(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as SliHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveSliHistory(
  tenantId: string,
  period: SliPeriod,
  history: SliHistoryEntry[],
  env: Env
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const key = `${tenantId}:slis:history:${period}`;
  await env.CACHE.put(key, JSON.stringify(history), {
    expirationTtl: SLI_HISTORY_TTL_SECONDS,
  });
}

export async function appendSliHistory(
  tenantId: string,
  period: SliPeriod,
  summary: SliSummary,
  env: Env
): Promise<void> {
  if (!env.CACHE?.get || !env.CACHE?.put) {
    return;
  }

  const history = await getSliHistory(tenantId, period, env);
  const entry: SliHistoryEntry = {
    timestamp: summary.timestamp,
    metrics: flattenSliMetrics(summary),
  };

  const updated = [...history, entry].slice(-MAX_HISTORY_ENTRIES);
  await saveSliHistory(tenantId, period, updated, env);
}

export async function getSliSummary(
  tenantId: string,
  period: SliPeriod,
  env: Env,
  options?: { toolSummary?: ToolSliSummary; force?: boolean }
): Promise<SliSummary> {
  const cacheKey = `${tenantId}:slis:${period}:latest`;

  if (!options?.force && env.CACHE?.get) {
    const cached = await env.CACHE.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as SliSummary;
      } catch {
        // fall through to recompute
      }
    }
  }

  const [search, cache, cost] = await Promise.all([
    getSearchMetricsSummary(tenantId, period, env),
    getSearchCacheMetrics(tenantId, period, env),
    getCostMetrics(tenantId, period, env),
  ]);

  const summary: SliSummary = {
    tenantId,
    period,
    timestamp: Date.now(),
    search,
    cache,
    cost: {
      totalCost: cost.totalCost,
      totalTokens: cost.totalTokens,
    },
    tools: options?.toolSummary,
  };

  if (env.CACHE?.put) {
    await env.CACHE.put(cacheKey, JSON.stringify(summary), {
      expirationTtl: SLI_CACHE_TTL_SECONDS,
    });
  }

  await appendSliHistory(tenantId, period, summary, env);
  return summary;
}
