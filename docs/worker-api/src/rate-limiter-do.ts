export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitOptions = {
  now: number;
  limit: number;
  windowSec: number;
};

export function applyRateLimit(
  timestamps: number[],
  options: RateLimitOptions
): { next: number[]; result: RateLimitResult } {
  const windowMs = options.windowSec * 1000;
  const cutoff = options.now - windowMs;
  const active = timestamps.filter((stamp) => stamp > cutoff);
  const remaining = Math.max(0, options.limit - active.length - 1);
  const allowed = active.length < options.limit;
  const next = allowed ? [...active, options.now] : active;
  const resetAt = active.length
    ? Math.max(...active) + windowMs
    : options.now + windowMs;

  return {
    next,
    result: { allowed, remaining, resetAt }
  };
}

type CheckRequest = {
  limit: number;
  windowSec: number;
  burst?: number;
  burstWindowSec?: number;
};

export class RateLimiter {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/check' || request.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }

    const body = (await request.json()) as CheckRequest;
    const now = Date.now();
    const stored = (await this.state.storage.get<number[]>('timestamps')) ?? [];

    const { next, result: sustainedResult } = applyRateLimit(stored, {
      now,
      limit: body.limit,
      windowSec: body.windowSec
    });

    let result = sustainedResult;

    if (body.burst !== undefined && body.burstWindowSec !== undefined) {
      const { result: burstResult } = applyRateLimit(stored, {
        now,
        limit: body.burst,
        windowSec: body.burstWindowSec
      });

      if (!burstResult.allowed) {
        result = {
          allowed: false,
          remaining: Math.min(sustainedResult.remaining, burstResult.remaining),
          resetAt: burstResult.resetAt
        };
      } else if (sustainedResult.allowed) {
        result = {
          allowed: true,
          remaining: Math.min(sustainedResult.remaining, burstResult.remaining),
          resetAt: sustainedResult.resetAt
        };
      }
    }

    if (next.length !== stored.length) {
      await this.state.storage.put('timestamps', next);
    }

    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' }
    });
  }
}
