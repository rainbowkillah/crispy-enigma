import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env } from '../packages/core/src';
import { createExecutionContext } from './utils/execution-context';

type StubHandler = (request: Request) => Promise<Response>;

class FakeStub {
  constructor(private handler: StubHandler) {}

  async fetch(input: string | Request, init?: RequestInit): Promise<Response> {
    const request = typeof input === 'string' ? new Request(input, init) : input;
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

class FakeKV {
  private store = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}

const sessionNamespace = new FakeNamespace(async (request) => {
  if (request.url.endsWith('/append')) {
    return new Response(JSON.stringify({ ok: true }));
  }
  if (request.url.endsWith('/history')) {
    return new Response(JSON.stringify([]), {
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

function usageKeys(tenantId: string): { daily: string; monthly: string } {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  return {
    daily: `${tenantId}:token-usage:daily:${day}`,
    monthly: `${tenantId}:token-usage:monthly:${month}`
  };
}

describe('token budget enforcement', () => {
  const ctx = createExecutionContext();
  it('rejects requests when daily budget is exceeded', async () => {
    const kv = new FakeKV();
    const keys = usageKeys('rainbowsmokeofficial');
    await kv.put(keys.daily, '50000');
    await kv.put(keys.monthly, '50000');

    const env: Env = {
      AI: {
        run: async () => ({ response: 'ok' })
      } as unknown as Ai,
      VECTORIZE: {} as Vectorize,
      CONFIG: {} as KVNamespace,
      CACHE: {} as KVNamespace,
      RATE_LIMITER: kv as unknown as KVNamespace,
      DB: {} as D1Database,
      CHAT_SESSION: sessionNamespace as unknown as DurableObjectNamespace,
      RATE_LIMITER_DO: rateLimiterNamespace as unknown as DurableObjectNamespace
    };

    const response = await worker.fetch(
      new Request('https://rainbowsmokeofficial.local/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: '11111111-1111-1111-1111-111111111111',
          message: 'hello world',
          stream: false
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as { ok: boolean; error?: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('budget_exceeded');
  });

  it('records token usage after successful request', async () => {
    const kv = new FakeKV();
    const keys = usageKeys('rainbowsmokeofficial');

    const env: Env = {
      AI: {
        run: async () => ({ response: 'ok' })
      } as unknown as Ai,
      VECTORIZE: {} as Vectorize,
      CONFIG: {} as KVNamespace,
      CACHE: {} as KVNamespace,
      RATE_LIMITER: kv as unknown as KVNamespace,
      DB: {} as D1Database,
      CHAT_SESSION: sessionNamespace as unknown as DurableObjectNamespace,
      RATE_LIMITER_DO: rateLimiterNamespace as unknown as DurableObjectNamespace
    };

    const response = await worker.fetch(
      new Request('https://rainbowsmokeofficial.local/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: '11111111-1111-1111-1111-111111111111',
          message: 'hello',
          stream: false
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    const daily = await kv.get(keys.daily);
    const monthly = await kv.get(keys.monthly);
    expect(Number(daily ?? 0)).toBeGreaterThan(0);
    expect(Number(monthly ?? 0)).toBeGreaterThan(0);
  });
});
