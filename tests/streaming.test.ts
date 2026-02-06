import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env } from '../packages/core/src';

type StubHandler = (request: Request) => Promise<Response>;

class FakeStub {
  constructor(private handler: StubHandler) {}

  async fetch(input: string | Request, init?: RequestInit): Promise<Response> {
    const request =
      typeof input === 'string' ? new Request(input, init) : input;
    return this.handler(request);
  }
}

class FakeNamespace {
  constructor(private handler: StubHandler) {}

  idFromName(name: string): DurableObjectId {
    return { name } as unknown as DurableObjectId;
  }

  get(_id: DurableObjectId): DurableObjectStub {
    return new FakeStub(this.handler) as unknown as DurableObjectStub;
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
      JSON.stringify({ allowed: true, remaining: 59, resetAt: 1700000000000 }),
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

describe('streaming behavior', () => {
  it('streams SSE when stream=true', async () => {
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
          stream: true
        })
      }),
      baseEnv
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const text = await response.text();
    expect(text).toContain('data:');
    expect(text).toContain('event: done');
  });

  it('falls back to JSON when stream=false', async () => {
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

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { stream: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.data.stream).toBe(false);
  });
});
