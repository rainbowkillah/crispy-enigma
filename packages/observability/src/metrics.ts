import type { Env } from '../../core/src/env';

export interface MetricEntry {
  tenantId: string;
  metricName: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram';
}

export interface MetricSummary {
  tenantId: string;
  metricName: string;
  period: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
}

export async function recordMetric(
  entry: MetricEntry,
  env: Env
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const suffix =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : String(Math.random()).slice(2);
  const key = `${entry.tenantId}:metrics:${entry.metricName}:${entry.timestamp}:${suffix}`;
  try {
    await env.CACHE.put(key, JSON.stringify(entry), {
      expirationTtl: 604800, // 7 days
    });
  } catch {
    // Best-effort; do not throw on metric write failure.
  }
}

const PERIOD_MS: Record<string, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
};

export async function getMetrics(
  tenantId: string,
  metricName: string,
  period: '1h' | '24h' | '7d',
  env: Env
): Promise<MetricSummary> {
  const summary: MetricSummary = {
    tenantId,
    metricName,
    period,
    count: 0,
    sum: 0,
    min: Infinity,
    max: -Infinity,
    avg: 0,
  };

  if (!env.CACHE?.list) {
    return summary;
  }

  const periodMs = PERIOD_MS[period] ?? PERIOD_MS['24h'];
  const cutoff = Date.now() - periodMs;
  const prefix = `${tenantId}:metrics:${metricName}:`;

  let values: number[] = [];
  let cursor: string | undefined;

  do {
    const listResult = await env.CACHE.list({
      prefix,
      cursor,
    });

    const validKeys = listResult.keys.filter((key) => {
      const parts = key.name.split(':');
      const timestamp = Number(parts[3]);
      return timestamp >= cutoff;
    });

    const BATCH_SIZE = 50;
    for (let i = 0; i < validKeys.length; i += BATCH_SIZE) {
      const batch = validKeys.slice(i, i + BATCH_SIZE);
      const batchValues = await Promise.all(
        batch.map((key) => env.CACHE.get(key.name))
      );

      for (const raw of batchValues) {
        if (!raw) {
          continue;
        }

        let entry: MetricEntry;
        try {
          entry = JSON.parse(raw) as MetricEntry;
        } catch {
          continue;
        }

        summary.count += 1;
        summary.sum += entry.value;
        summary.min = Math.min(summary.min, entry.value);
        summary.max = Math.max(summary.max, entry.value);
        values.push(entry.value);
      }
    }

    cursor = listResult.list_complete ? undefined : (listResult.cursor as string);
  } while (cursor);

  if (summary.count > 0) {
    summary.avg = summary.sum / summary.count;
    values.sort((a, b) => a - b);
    summary.p50 = values[Math.floor(values.length * 0.5)];
    summary.p95 = values[Math.floor(values.length * 0.95)];
    summary.p99 = values[Math.floor(values.length * 0.99)];
  } else {
    summary.min = 0;
    summary.max = 0;
  }

  return summary;
}

// Search Metrics specific implementation (moved from worker-api)

export type SearchMetrics = {
  tenantId: string;
  traceId?: string;
  route: 'search';
  status: 'success' | 'error' | 'cache-hit';
  cacheHit: boolean;
  latencies: {
    totalMs: number;
    rewriteMs?: number;
    embeddingMs?: number;
    retrievalMs?: number;
    ragAssemblyMs?: number;
    generationMs?: number;
    followUpGenerationMs?: number;
  };
  tokensUsed?: {
    rewrite?: { in: number; out: number };
    followUpGeneration?: { in: number; out: number };
  };
  topK: number;
  matchesReturned: number;
};

export type CacheCheckEvent = {
  timestamp: number;
  hit: boolean;
  latencyMs: number;
  queryHash: string;
};

export async function recordSearchMetrics(
  env: Env,
  tenantId: string,
  metrics: SearchMetrics
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const key = `${tenantId}:search:metrics:${Date.now()}`;
  try {
    await env.CACHE.put(key, JSON.stringify(metrics), {
      expirationTtl: 604800
    });
  } catch (error) {
    // Best effort
  }
}

export async function recordCacheCheck(
  env: Env,
  tenantId: string,
  event: CacheCheckEvent
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : String(Math.random()).slice(2);
  const key = `${tenantId}:search:cache-check:${event.timestamp}:${suffix}`;
  try {
    await env.CACHE.put(key, JSON.stringify(event), {
      expirationTtl: 86400
    });
  } catch (error) {
    // Best effort
  }
}

export type SearchCacheMetrics = {
  tenantId: string;
  period: string;
  hits: number;
  misses: number;
  hitRate: number;
  avgLatencyMs: number;
  totalChecks: number;
};

export async function getSearchCacheMetrics(
  tenantId: string,
  period: '1h' | '24h' | '7d',
  env: Env
): Promise<SearchCacheMetrics> {
  const result: SearchCacheMetrics = {
    tenantId,
    period,
    hits: 0,
    misses: 0,
    hitRate: 0,
    avgLatencyMs: 0,
    totalChecks: 0,
  };

  if (!env.CACHE?.list) {
    return result;
  }

  const periodMs = PERIOD_MS[period] ?? PERIOD_MS['24h'];
  const cutoff = Date.now() - periodMs;
  const prefix = `${tenantId}:search:cache-check:`;

  let totalLatency = 0;
  let cursor: string | undefined;

  do {
    const listResult = await env.CACHE.list({ prefix, cursor });
    const validKeys = listResult.keys.filter(k => {
      const ts = Number(k.name.split(':')[3]);
      return ts >= cutoff;
    });

    const batchSize = 50;
    for (let i = 0; i < validKeys.length; i += batchSize) {
      const batch = validKeys.slice(i, i + batchSize);
      const values = await Promise.all(batch.map(k => env.CACHE.get(k.name)));
      
      for (const val of values) {
        if (!val) continue;
        try {
          const entry = JSON.parse(val) as CacheCheckEvent;
          result.totalChecks++;
          if (entry.hit) {
            result.hits++;
          } else {
            result.misses++;
          }
          totalLatency += entry.latencyMs;
        } catch {
          // ignore
        }
      }
    }
    cursor = listResult.list_complete ? undefined : (listResult.cursor as string);
  } while (cursor);

  if (result.totalChecks > 0) {
    result.hitRate = result.hits / result.totalChecks;
    result.avgLatencyMs = totalLatency / result.totalChecks;
  }

  return result;
}
