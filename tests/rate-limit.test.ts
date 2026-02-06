import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env } from '../packages/core/src';

type StubHandler = (request: Request) => Promise<Response>;

class FakeNamespace {
  constructor(private handler: StubHandler) {}

  idFromName(name: string): DurableObjectId {
    return { name } as unknown as DurableObjectId;
  }

  get(_id: DurableObjectId): DurableObjectStub {
    return {
      fetch: async (input: string | Request, init?: RequestInit) => {
        const request =
          typeof input === 'string' ? new Request(input, init) : input;
        return this.handler(request);
      }
    } as DurableObjectStub;
  }
}

const sessionNamespace = new FakeNamespace(async (request) => {
  if (request.url.endsWith('/append')) {
    return new Response(JSON.stringify({ ok: true }));
  }
  return new Response('Not found', { status: 404 });
});

const rateLimiterNamespace = new FakeNamespace(async (request) => {
  if (request.url.endsWith('/check')) {
    return new Response(
      JSON.stringify({ allowed: false, remaining: 0, resetAt: 1700000000000 }),
      { headers: { 'content-type': 'application/json' } }
    );
  }
  return new Response('Not found', { status: 404 });
});

const baseEnv: Env = {
  AI: {} as Ai,
  VECTORIZE: {} as Vectorize,
  CONFIG: {} as KVNamespace,
  CACHE: {} as KVNamespace,
  RATE_LIMITER: {} as KVNamespace,
  DB: {} as D1Database,
  CHAT_SESSION: sessionNamespace as unknown as DurableObjectNamespace,
  RATE_LIMITER_DO: rateLimiterNamespace as unknown as DurableObjectNamespace
};

describe('rate limit enforcement', () => {
  it('returns 429 and headers when over limit', async () => {
    const response = await worker.fetch(
      new Request('https://example.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'example'
        },
        body: JSON.stringify({
          sessionId: '11111111-1111-1111-1111-111111111111',
          message: 'hello',
          stream: false
        })
      }),
      baseEnv
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(response.headers.get('x-ratelimit-reset')).toBe('1700000000000');
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('rate_limited');
  });
});
