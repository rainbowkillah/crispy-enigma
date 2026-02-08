import type { Env } from '../../core/src/env';
import {
  type SliPeriod,
  type SliSummary,
  type ToolSliSummary,
  flattenSliMetrics,
  getSliHistory,
  getSliSummary,
} from './slis';

export type Anomaly = {
  metric: string;
  period: SliPeriod;
  timestamp: number;
  value: number;
  mean: number;
  stddev: number;
  zScore: number;
  direction: 'high' | 'low';
  threshold: number;
};

export type AnomalySummary = {
  tenantId: string;
  period: SliPeriod;
  evaluatedAt: number;
  anomalies: Anomaly[];
};

const ANOMALY_TTL_SECONDS = 604_800; // 7 days
const MIN_HISTORY = 5;
const DEFAULT_THRESHOLD = 3;

const METRIC_DIRECTIONS: Record<string, 'high' | 'low'> = {
  'search.error_rate': 'high',
  'search.latency_avg_ms': 'high',
  'search.latency_p95_ms': 'high',
  'cache.hit_rate': 'low',
  'cache.avg_latency_ms': 'high',
  'tools.error_rate': 'high',
  'tools.avg_duration_ms': 'high',
  'cost.total_usd': 'high',
  'cost.total_tokens': 'high',
};

function mean(values: number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.length ? total / values.length : 0;
}

function stddev(values: number[], avg: number): number {
  if (!values.length) {
    return 0;
  }
  const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export async function recordAnomalies(
  tenantId: string,
  anomalies: Anomaly[],
  env: Env
): Promise<void> {
  if (!env.CACHE?.put || anomalies.length === 0) {
    return;
  }

  const timestamp = Date.now();
  await Promise.all(
    anomalies.map((anomaly) => {
      const key = `${tenantId}:anomalies:${anomaly.period}:${timestamp}:${anomaly.metric}`;
      return env.CACHE.put(key, JSON.stringify(anomaly), {
        expirationTtl: ANOMALY_TTL_SECONDS,
      });
    })
  );
}

export async function getStoredAnomalies(
  tenantId: string,
  period: SliPeriod,
  env: Env
): Promise<Anomaly[]> {
  if (!env.CACHE?.list) {
    return [];
  }

  const prefix = `${tenantId}:anomalies:${period}:`;
  let cursor: string | undefined;
  const anomalies: Anomaly[] = [];

  do {
    const listResult = await env.CACHE.list({ prefix, cursor });
    const batch = listResult.keys.slice(0, 50);
    const values = await Promise.all(batch.map((key) => env.CACHE.get(key.name)));

    for (const raw of values) {
      if (!raw) {
        continue;
      }
      try {
        anomalies.push(JSON.parse(raw) as Anomaly);
      } catch {
        // ignore
      }
    }

    cursor = listResult.list_complete ? undefined : (listResult.cursor as string);
  } while (cursor);

  return anomalies.sort((a, b) => b.timestamp - a.timestamp);
}

export async function detectAnomalies(
  tenantId: string,
  period: SliPeriod,
  env: Env,
  options?: { summary?: SliSummary; toolSummary?: ToolSliSummary }
): Promise<AnomalySummary> {
  const history = await getSliHistory(tenantId, period, env);
  const currentSummary =
    options?.summary ??
    (await getSliSummary(tenantId, period, env, { force: true, toolSummary: options?.toolSummary }));
  const metrics = flattenSliMetrics(currentSummary);

  const anomalies: Anomaly[] = [];
  const evaluatedAt = Date.now();

  for (const [metric, value] of Object.entries(metrics)) {
    const historyValues = history
      .map((entry) => entry.metrics[metric])
      .filter((val): val is number => typeof val === 'number' && Number.isFinite(val));

    if (historyValues.length < MIN_HISTORY) {
      continue;
    }

    const avg = mean(historyValues);
    const deviation = stddev(historyValues, avg);
    if (deviation === 0) {
      continue;
    }

    const zScore = (value - avg) / deviation;
    const direction = METRIC_DIRECTIONS[metric] ?? 'high';

    const threshold = DEFAULT_THRESHOLD;
    const isAnomaly =
      direction === 'high'
        ? value > avg + threshold * deviation
        : value < avg - threshold * deviation;

    if (!isAnomaly) {
      continue;
    }

    anomalies.push({
      metric,
      period,
      timestamp: evaluatedAt,
      value,
      mean: avg,
      stddev: deviation,
      zScore,
      direction,
      threshold,
    });
  }

  await recordAnomalies(tenantId, anomalies, env);

  return {
    tenantId,
    period,
    evaluatedAt,
    anomalies,
  };
}
