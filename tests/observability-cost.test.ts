import { describe, it, expect, vi } from 'vitest';
import { calculateCost, recordCost, getCostMetrics } from '../packages/observability/src/cost';
import type { Env } from '../packages/core/src/env';

describe('Cost', () => {
  it('should calculate cost correctly', () => {
    // default model: 0.0002 per 1k input/output
    // 1000 input tokens = 0.0002
    // 1000 output tokens = 0.0002
    const cost = calculateCost('default', 1000, 1000);
    expect(cost).toBe(0.0004);
  });

  const mockKv = {
    put: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
  };
  const mockEnv = { CACHE: mockKv } as unknown as Env;

  it('should record cost', async () => {
    await recordCost('t', 'default', 1000, 1000, mockEnv);
    expect(mockKv.put).toHaveBeenCalled();
  });

  it('should retrieve cost metrics', async () => {
    const now = Date.now();
    mockKv.list.mockResolvedValue({
      keys: [{ name: `t:cost:${now}:uuid` }],
      list_complete: true
    });
    mockKv.get.mockResolvedValue(JSON.stringify({
      tenantId: 't',
      modelId: 'default',
      tokensIn: 1000,
      tokensOut: 1000,
      cost: 0.0004,
      timestamp: now
    }));

    const metrics = await getCostMetrics('t', '1h', mockEnv);
    expect(metrics.totalCost).toBe(0.0004);
    expect(metrics.totalTokens).toBe(2000);
  });
});
