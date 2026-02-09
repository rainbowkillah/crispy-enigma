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

type GatewayOptions = {
  gateway?: { id?: string; metadata?: Record<string, string> };
  stream?: boolean;
  [key: string]: unknown;
};

type AiRunCall = {
  modelId: string;
  input: unknown;
  options: GatewayOptions;
};

function makeEnv(calls: AiRunCall[], overrides: Partial<Env> = {}): Env {
  const fakeAi = {
    run: async (modelId: string, input: unknown, options: unknown) => {
      calls.push({ modelId, input, options: options as GatewayOptions });
      return { response: 'ok' };
    }
  };

  return {
    AI: fakeAi as unknown as Ai,
    VECTORIZE: {} as Vectorize,
    CONFIG: {} as KVNamespace,
    CACHE: {} as KVNamespace,
    RATE_LIMITER: {} as KVNamespace,
    DB: {} as D1Database,
    CHAT_SESSION: sessionNamespace as unknown as DurableObjectNamespace,
    RATE_LIMITER_DO: rateLimiterNamespace as unknown as DurableObjectNamespace,
    ...overrides
  };
}
const ctx = createExecutionContext();

describe('AI Gateway integration', () => {
  it('routes model calls through tenant gateway id and metadata', async () => {
    const calls: AiRunCall[] = [];
    const env = makeEnv(calls);

    const response = await worker.fetch(
      new Request('https://mrrainbowsmoke.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'mrrainbowsmoke'
        },
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
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options?.gateway?.id).toBe('ai-gate');
    expect(calls[0]?.options?.gateway?.metadata?.tenantId).toBe('mrrainbowsmoke');
    expect(calls[0]?.options?.gateway?.metadata?.route).toBe('/chat');
    expect(calls[0]?.options?.gateway?.metadata?.sessionId).toBe(
      '11111111-1111-1111-1111-111111111111'
    );
  });

  it('selects chat model from tenant config', async () => {
    const calls: AiRunCall[] = [];
    const env = makeEnv(calls);

    await worker.fetch(
      new Request('https://mrrainbowsmoke.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'mrrainbowsmoke'
        },
        body: JSON.stringify({
          sessionId: '11111111-1111-1111-1111-111111111111',
          message: 'hello',
          stream: false
        })
      }),
      env,
      ctx
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.modelId).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
    expect(calls[0]?.options?.gateway?.id).toBe('ai-gate');
    expect(calls[0]?.options?.gateway?.metadata?.tenantId).toBe('mrrainbowsmoke');
  });

  it('passes stream=true to Workers AI when streaming', async () => {
    const calls: AiRunCall[] = [];
    const env = makeEnv(calls);

    const response = await worker.fetch(
      new Request('https://mrrainbowsmoke.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'mrrainbowsmoke'
        },
        body: JSON.stringify({
          sessionId: '11111111-1111-1111-1111-111111111111',
          message: 'hello',
          stream: true
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options?.stream).toBe(true);
    const text = await response.text();
    expect(text).toContain('event: done');
  });

  it('uses request model override when provided', async () => {
    const calls: AiRunCall[] = [];
    const env = makeEnv(calls);

    await worker.fetch(
      new Request('https://mrrainbowsmoke.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'mrrainbowsmoke'
        },
        body: JSON.stringify({
          sessionId: '11111111-1111-1111-1111-111111111111',
          message: 'hello',
          modelId: '@cf/meta/custom-model',
          stream: false
        })
      }),
      env,
      ctx
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.modelId).toBe('@cf/meta/custom-model');
  });

  it('rejects model override when allowlist is enforced', async () => {
    const calls: AiRunCall[] = [];
    const env = makeEnv(calls);

    const response = await worker.fetch(
      new Request('https://rainbowsmokeofficial.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: '11111111-1111-1111-1111-111111111111',
          message: 'hello',
          modelId: '@cf/meta/not-allowed',
          stream: false
        })
      }),
      env,
      ctx
    );

    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('falls back to fallback model when primary fails', async () => {
    const calls: AiRunCall[] = [];
    const fakeAi = {
      run: async (modelId: string, input: unknown, options: unknown) => {
        calls.push({ modelId, input, options: options as GatewayOptions });
        if (modelId === '@cf/meta/primary') {
          throw new Error('primary failed');
        }
        return { response: 'fallback ok' };
      }
    };

    const env: Env = {
      ...makeEnv([], {
        MODEL_ID: '@cf/meta/primary',
        FALLBACK_MODEL_ID: '@cf/meta/fallback'
      }),
      AI: fakeAi as unknown as Ai
    };

    const response = await worker.fetch(
      new Request('https://mrrainbowsmoke.local/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'mrrainbowsmoke'
        },
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
    expect(calls.map((c) => c.modelId)).toEqual([
      '@cf/meta/primary',
      '@cf/meta/fallback'
    ]);
    const body = (await response.json()) as {
      ok: boolean;
      data?: { message?: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data?.message).toBe('fallback ok');
  });
});
