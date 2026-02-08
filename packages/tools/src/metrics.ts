import type { Env } from '../../core/src/env.js';

export type ToolMetricsEntry = {
  tenantId: string;
  toolName: string;
  durationMs: number;
  success: boolean;
  tokensUsed?: number;
  cacheHit?: boolean;
  timestamp: number;
};

export type ToolMetricsSummary = {
  tenantId: string;
  period: string;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  totalTokensUsed: number;
  byTool: Record<
    string,
    {
      executions: number;
      successCount: number;
      errorCount: number;
      avgDurationMs: number;
    }
  >;
};

export async function recordToolMetrics(
  metrics: ToolMetricsEntry,
  env: Env
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const suffix =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : String(Math.random()).slice(2);
  const key = `${metrics.tenantId}:tools:metrics:${metrics.timestamp}:${suffix}`;
  try {
    await env.CACHE.put(key, JSON.stringify(metrics), {
      expirationTtl: 604800, // 7 days
    });
  } catch {
    // Best-effort; do not throw on metrics write failure.
  }
}

const PERIOD_MS: Record<string, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
};

export async function getToolMetrics(
  tenantId: string,
  period: '1h' | '24h' | '7d',
  env: Env
): Promise<ToolMetricsSummary> {
  const summary: ToolMetricsSummary = {
    tenantId,
    period,
    totalExecutions: 0,
    successCount: 0,
    errorCount: 0,
    avgDurationMs: 0,
    totalTokensUsed: 0,
    byTool: {},
  };

  if (!env.CACHE?.list) {
    return summary;
  }

  const periodMs = PERIOD_MS[period] ?? PERIOD_MS['24h'];
  const cutoff = Date.now() - periodMs;
  const prefix = `${tenantId}:tools:metrics:`;

  let totalDuration = 0;
  let cursor: string | undefined;

  do {
    const listResult = await env.CACHE.list({
      prefix,
      cursor,
    });

    // Filter keys within the time window
    const validKeys = listResult.keys.filter((key) => {
      const parts = key.name.split(':');
      const timestamp = Number(parts[3]);
      return timestamp >= cutoff;
    });

    // Fetch values in parallel batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < validKeys.length; i += BATCH_SIZE) {
      const batch = validKeys.slice(i, i + BATCH_SIZE);
      const values = await Promise.all(
        batch.map((key) => env.CACHE.get(key.name))
      );

      for (const raw of values) {
        if (!raw) {
          continue;
        }

        let entry: ToolMetricsEntry;
        try {
          entry = JSON.parse(raw) as ToolMetricsEntry;
        } catch {
          continue;
        }

        summary.totalExecutions += 1;
        totalDuration += entry.durationMs;
        summary.totalTokensUsed += entry.tokensUsed ?? 0;

        if (entry.success) {
          summary.successCount += 1;
        } else {
          summary.errorCount += 1;
        }

        if (!summary.byTool[entry.toolName]) {
          summary.byTool[entry.toolName] = {
            executions: 0,
            successCount: 0,
            errorCount: 0,
            avgDurationMs: 0,
          };
        }
        const toolStats = summary.byTool[entry.toolName];
        toolStats.executions += 1;
        toolStats.avgDurationMs += entry.durationMs;
        if (entry.success) {
          toolStats.successCount += 1;
        } else {
          toolStats.errorCount += 1;
        }
      }
    }

    cursor = listResult.list_complete ? undefined : (listResult.cursor as string);
  } while (cursor);

  if (summary.totalExecutions > 0) {
    summary.avgDurationMs = Math.round(totalDuration / summary.totalExecutions);
  }

  for (const stats of Object.values(summary.byTool)) {
    if (stats.executions > 0) {
      stats.avgDurationMs = Math.round(stats.avgDurationMs / stats.executions);
    }
  }

  return summary;
}
