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

  it('respects custom windowSec', () => {
    const now = 1700000000000;
    // 2 timestamps within a 10s window
    const timestamps = [now - 5000, now - 8000];
    const { result } = applyRateLimit(timestamps, {
      now,
      limit: 3,
      windowSec: 10
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('expires timestamps outside custom window', () => {
    const now = 1700000000000;
    // 3 timestamps but 2 are outside a 5s window
    const timestamps = [now - 2000, now - 6000, now - 7000];
    const { result } = applyRateLimit(timestamps, {
      now,
      limit: 2,
      windowSec: 5
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('can be used for burst checking with a short window', () => {
    const now = 1700000000000;
    // 5 requests in the last 2 seconds (burst scenario)
    const timestamps = [
      now - 500, now - 1000, now - 1500, now - 1800, now - 1900
    ];

    // Sustained check: 60 req per 60s — allowed
    const sustained = applyRateLimit(timestamps, {
      now,
      limit: 60,
      windowSec: 60
    });
    expect(sustained.result.allowed).toBe(true);

    // Burst check: 5 req per 5s — denied (at limit)
    const burst = applyRateLimit(timestamps, {
      now,
      limit: 5,
      windowSec: 5
    });
    expect(burst.result.allowed).toBe(false);
  });
});
