import { describe, expect, it } from 'vitest';
import { applyRateLimit } from '../apps/worker-api/src/rate-limiter-do';

describe('applyRateLimit', () => {
  it('allows requests under limit and tracks remaining', () => {
    const now = 1700000000000;
    const { next, result } = applyRateLimit([now - 1000], {
      now,
      limit: 3,
      windowSec: 60
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(next).toHaveLength(2);
  });

  it('denies requests over limit', () => {
    const now = 1700000000000;
    const timestamps = [now - 1000, now - 2000, now - 3000];
    const { next, result } = applyRateLimit(timestamps, {
      now,
      limit: 3,
      windowSec: 60
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(next).toHaveLength(3);
  });
});
