import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env } from '../packages/core/src';

type StubHandler = (request: Request) => Promise<Response>;

class FakeStub {
  constructor(private handler: StubHandler, private sink: (req: Request) => void) {}

  async fetch(input: string | Request, init?: RequestInit): Promise<Response> {
    const request =
      typeof input === 'string' ? new Request(input, init) : input;
    this.sink(request);
    return this.handler(request);
  }
}

class FakeNamespace {
  public lastRequest: Request | null = null;

  constructor(private handler: StubHandler) {}

  idFromName(name: string): DurableObjectId {
    return { name } as unknown as DurableObjectId;
  }

  get(_id: DurableObjectId): DurableObjectStub {
    return new FakeStub(this.handler, (req) => {
      this.lastRequest = req;
    }) as unknown as DurableObjectStub;
  }
}

const sessionNamespace = new FakeNamespace(async (request) => {
  if (request.url.endsWith('/append')) {
    return new Response(JSON.stringify({ ok: true }));
  }
  if (request.url.endsWith('/history')) {
    return new Response(
      JSON.stringify([
        { role: 'user', content: 'hi', timestamp: 1700000000000 }
      ]),
      {
        headers: { 'content-type': 'application/json' }
      }
    );
  }
  if (request.url.endsWith('/clear')) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' }
    });
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

describe('chat endpoint', () => {
  it('accepts valid requests with stream=false', async () => {
    const request = new Request('https://example.local/chat', {
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
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { status: string; sessionId: string; stream: boolean; message: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      status: 'accepted',
      sessionId: '11111111-1111-1111-1111-111111111111',
      stream: false,
      message: expect.any(String)
    });
  });

  it('rejects invalid requests', async () => {
    const request = new Request('https://example.local/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'example'
      },
      body: JSON.stringify({
        sessionId: 'not-a-uuid',
        message: 'hello'
      })
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('invalid_request');
  });

  it('requires tenant context', async () => {
    const request = new Request('https://unknown.local/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: '11111111-1111-1111-1111-111111111111',
        message: 'hello'
      })
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(400);
  });

  it('defaults to streaming when stream is omitted', async () => {
    const request = new Request('https://example.local/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'example'
      },
      body: JSON.stringify({
        sessionId: '11111111-1111-1111-1111-111111111111',
        message: 'hello'
      })
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const text = await response.text();
    expect(text).toContain('data:');
    expect(text).toContain('event: done');
  });

  it('streams when stream=true', async () => {
    const request = new Request('https://example.local/chat', {
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
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
  });

  it('returns history for session', async () => {
    const response = await worker.fetch(
      new Request(
        'https://example.local/chat/11111111-1111-1111-1111-111111111111/history',
        {
          method: 'GET',
          headers: { 'x-tenant-id': 'example' }
        }
      ),
      baseEnv
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { role: string; content: string; timestamp: number }[];
    expect(body).toEqual([
      { role: 'user', content: 'hi', timestamp: 1700000000000 }
    ]);
  });

  it('clears session on delete', async () => {
    const response = await worker.fetch(
      new Request(
        'https://example.local/chat/11111111-1111-1111-1111-111111111111',
        {
          method: 'DELETE',
          headers: { 'x-tenant-id': 'example' }
        }
      ),
      baseEnv
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body).toEqual({ ok: true });
  });

  it('rejects invalid sessionId on history', async () => {
    const response = await worker.fetch(
      new Request('https://example.local/chat/not-a-uuid/history', {
        method: 'GET',
        headers: { 'x-tenant-id': 'example' }
      }),
      baseEnv
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('invalid_request');
  });

  it('rejects invalid sessionId on delete', async () => {
    const response = await worker.fetch(
      new Request('https://example.local/chat/not-a-uuid', {
        method: 'DELETE',
        headers: { 'x-tenant-id': 'example' }
      }),
      baseEnv
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('invalid_request');
  });
});
