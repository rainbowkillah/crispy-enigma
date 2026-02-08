import { describe, it, expect, vi } from 'vitest';
import { detectAnomalies } from '../packages/observability/src/anomalies';
import type { Env } from '../packages/core/src/env';
import type { SliSummary } from '../packages/observability/src/slis';

function buildEnv(history: unknown[]) {
  const CACHE = {
    get: vi.fn(async () => JSON.stringify(history)),
    put: vi.fn(async () => undefined),
  };
  return { CACHE } as unknown as Env;
}

describe('Anomaly detection', () => {
  it('detects high error rate anomalies', async () => {
    const history = [
      { timestamp: 1, metrics: { 'search.error_rate': 0.01 } },
      { timestamp: 2, metrics: { 'search.error_rate': 0.02 } },
      { timestamp: 3, metrics: { 'search.error_rate': 0.015 } },
      { timestamp: 4, metrics: { 'search.error_rate': 0.02 } },
      { timestamp: 5, metrics: { 'search.error_rate': 0.01 } },
    ];
    const env = buildEnv(history);

    const summary: SliSummary = {
      tenantId: 't',
      period: '1h',
      timestamp: Date.now(),
      search: {
        totalRequests: 10,
        errorRate: 0.5,
        latencyAvgMs: 100,
        latencyP95Ms: 200,
      },
      cache: {
        tenantId: 't',
        period: '1h',
        hits: 5,
        misses: 5,
        hitRate: 0.5,
        avgLatencyMs: 20,
        totalChecks: 10,
      },
      cost: {
        totalCost: 0.5,
        totalTokens: 1000,
      },
      tools: {
        totalExecutions: 2,
        errorRate: 0,
        avgDurationMs: 50,
      },
    };

    const result = await detectAnomalies('t', '1h', env, { summary });
    expect(result.anomalies.length).toBeGreaterThan(0);
    expect(result.anomalies[0].metric).toBe('search.error_rate');
  });
});
