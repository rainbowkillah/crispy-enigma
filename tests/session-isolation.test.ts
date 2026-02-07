import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env } from '../packages/core/src';

type StubHandler = (request: Request) => Promise<Response>;

class CaptureNamespace {
  public names: string[] = [];
  constructor(private handler: StubHandler) {}

  idFromName(name: string): DurableObjectId {
    this.names.push(name);
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

const sessionNamespace = new CaptureNamespace(async (request) => {
  if (request.url.endsWith('/append')) {
    return new Response(JSON.stringify({ ok: true }));
  }
  return new Response('Not found', { status: 404 });
});

const rateLimiterNamespace = new CaptureNamespace(async (request) => {
  if (request.url.endsWith('/check')) {
    return new Response(
      JSON.stringify({ allowed: true, remaining: 59, resetAt: 1700000000000 }),
      { headers: { 'content-type': 'application/json' } }
    );
  }
  return new Response('Not found', { status: 404 });
});

const baseEnv: Env = {
  AI: {
    run: async () => ({ response: 'test-response' })
  } as unknown as Ai,
  VECTORIZE: {} as Vectorize,
  CONFIG: {} as KVNamespace,
  CACHE: {} as KVNamespace,
  RATE_LIMITER: {} as KVNamespace,
  DB: {} as D1Database,
  CHAT_SESSION: sessionNamespace as unknown as DurableObjectNamespace,
  RATE_LIMITER_DO: rateLimiterNamespace as unknown as DurableObjectNamespace
};

describe('session isolation', () => {
  it('uses tenant-scoped DO names for session and rate limiter', async () => {
    await worker.fetch(
      new Request('https://example.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'example'
        },
        body: JSON.stringify({
          sessionId: '11111111-1111-1111-1111-111111111111',
          message: 'hello',
          userId: 'user-123',
          stream: false
        })
      }),
      baseEnv
    );

    expect(sessionNamespace.names).toContain(
      'example:11111111-1111-1111-1111-111111111111'
    );
    expect(rateLimiterNamespace.names).toContain('example:ratelimit:user-123');
  });

  it('changes DO names across tenants', async () => {
    await worker.fetch(
      new Request('https://alpha.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: '22222222-2222-2222-2222-222222222222',
          message: 'hello',
          userId: 'user-123',
          stream: false
        })
      }),
      baseEnv
    );

    expect(sessionNamespace.names).toContain(
      'alpha:22222222-2222-2222-2222-222222222222'
    );
    expect(rateLimiterNamespace.names).toContain('alpha:ratelimit:user-123');
  });
});
