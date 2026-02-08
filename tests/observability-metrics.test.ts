import { describe, it, expect, vi } from 'vitest';
import { recordMetric, getMetrics } from '../packages/observability/src/metrics';
import type { Env } from '../packages/core/src/env';

describe('Metrics', () => {
  const mockKv = {
    put: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
  };
  const mockEnv = { CACHE: mockKv } as unknown as Env;

  it('should record metric to KV', async () => {
    await recordMetric({
      tenantId: 't',
      metricName: 'm',
      value: 1,
      timestamp: 100,
      type: 'counter'
    }, mockEnv);

    expect(mockKv.put).toHaveBeenCalled();
    const key = mockKv.put.mock.calls[0][0];
    expect(key).toContain('t:metrics:m:100:');
  });

  it('should retrieve and aggregate metrics', async () => {
    const now = Date.now();
    mockKv.list.mockResolvedValue({
      keys: [{ name: `t:metrics:m:${now}:uuid` }],
      list_complete: true
    });
    mockKv.get.mockResolvedValue(JSON.stringify({
      tenantId: 't',
      metricName: 'm',
      value: 10,
      timestamp: now,
      type: 'histogram'
    }));

    const summary = await getMetrics('t', 'm', '1h', mockEnv);
    expect(summary.count).toBe(1);
    expect(summary.sum).toBe(10);
    expect(summary.avg).toBe(10);
    expect(summary.min).toBe(10);
    expect(summary.max).toBe(10);
  });
});
