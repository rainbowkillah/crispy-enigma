import { describe, it, expect, vi } from 'vitest';
import {
  upsertAlertRules,
  deleteAlertRule,
  evaluateAlertRules,
  getAlertRules,
  type AlertRule,
} from '../packages/observability/src/alerts';
import type { Env } from '../packages/core/src/env';
import type { SliSummary } from '../packages/observability/src/slis';

function createEnv() {
  const store = new Map<string, string>();
  const CONFIG = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
  return { store, env: { CONFIG } as unknown as Env };
}

const baseSummary: SliSummary = {
  tenantId: 't',
  period: '1h',
  timestamp: 0,
  search: {
    totalRequests: 10,
    errorRate: 0.2,
    latencyAvgMs: 120,
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
  tools: {
    totalExecutions: 4,
    errorRate: 0.25,
    avgDurationMs: 80,
  },
  cost: {
    totalCost: 1.5,
    totalTokens: 2000,
  },
};

describe('Alert rules', () => {
  it('upserts and evaluates rules', async () => {
    const { env } = createEnv();
    const rules = await upsertAlertRules(
      't',
      [
        {
          name: 'High search error rate',
          metric: 'search.error_rate',
          comparator: '>',
          threshold: 0.1,
          period: '1h',
          enabled: true,
        },
      ],
      env
    );

    const evaluations = evaluateAlertRules(rules, baseSummary);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].triggered).toBe(true);
  });

  it('deletes rules by id', async () => {
    const { env } = createEnv();
    const created = await upsertAlertRules(
      't',
      [
        {
          id: 'rule-1',
          name: 'Latency high',
          metric: 'search.latency_p95_ms',
          comparator: '>',
          threshold: 150,
          period: '1h',
          enabled: true,
        },
      ],
      env
    );

    const afterDelete = await deleteAlertRule('t', 'rule-1', env);
    expect(created).toHaveLength(1);
    expect(afterDelete).toHaveLength(0);
  });

  it('persists rules in CONFIG', async () => {
    const { env } = createEnv();
    const rulesInput: Partial<AlertRule>[] = [
      {
        id: 'rule-2',
        name: 'Cost high',
        metric: 'cost.total_usd',
        comparator: '>',
        threshold: 5,
        period: '24h',
        enabled: true,
      },
    ];

    await upsertAlertRules('t', rulesInput, env);
    const stored = await getAlertRules('t', env);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('rule-2');
  });
});
