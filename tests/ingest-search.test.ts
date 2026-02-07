import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env } from '../packages/core/src';

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

class FakeVectorize {
  public lastUpsert: VectorizeVector[] = [];
  public lastQuery?: VectorizeQueryOptions;

  async upsert(vectors: VectorizeVector[]): Promise<VectorizeAsyncMutation> {
    this.lastUpsert = vectors;
    return { count: vectors.length, mutationId: 'test' } as VectorizeAsyncMutation;
  }

  async query(_vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches> {
    this.lastQuery = options;
    const matches = [
      {
        id: 'doc-1:0',
        score: 0.9,
        metadata: {
          tenantId: 'example',
          docId: 'doc-1',
          chunkId: '0',
          text: 'Hello from vectorize'
        }
      }
    ];
    return { matches, count: matches.length } as VectorizeMatches;
  }
}

class FakeKV {
  public store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
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

function makeEnv(
  vectorize: FakeVectorize,
  aiRun?: (modelId: string, input: unknown) => Promise<unknown>
): Env {
  const fakeAi = {
    run: aiRun
      ? async (modelId: string, input: unknown) => aiRun(modelId, input)
      : async (_modelId: string, input: unknown) => {
          if (input && typeof input === 'object' && 'text' in input) {
            const record = input as { text?: string[] };
            const texts = record.text ?? [];
            return {
              data: texts.map(() => ({ embedding: [0.1, 0.2] }))
            };
          }
          return 'Mock response';
        }
  };

  const kv = new FakeKV();
  return {
    AI: fakeAi as unknown as Ai,
    VECTORIZE: vectorize as unknown as Vectorize,
    CONFIG: {} as KVNamespace,
    CACHE: kv as unknown as KVNamespace,
    RATE_LIMITER: {} as KVNamespace,
    DB: {} as D1Database,
    CHAT_SESSION: sessionNamespace as unknown as DurableObjectNamespace,
    RATE_LIMITER_DO: rateLimiterNamespace as unknown as DurableObjectNamespace
  };
}

describe('ingest/search endpoints', () => {
  it('ingests text and upserts vectors', async () => {
    const vectorize = new FakeVectorize();
    const env = makeEnv(vectorize);

    const response = await worker.fetch(
      new Request('https://example.local/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'example'
        },
        body: JSON.stringify({
          docId: 'doc-1',
          text: 'Hello world',
          source: 'unit-test'
        })
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(vectorize.lastUpsert.length).toBeGreaterThan(0);
    expect(vectorize.lastUpsert[0]?.metadata?.docId).toBe('doc-1');
  });

  it('searches and returns citations', async () => {
    const vectorize = new FakeVectorize();
    const env = makeEnv(vectorize);

    const response = await worker.fetch(
      new Request('https://example.local/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': 'example'
        },
        body: JSON.stringify({
          query: 'hello',
          topK: 3
        })
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { answer?: string; sources?: Array<{ docId?: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.data.answer).toBeTruthy();
    expect(body.data.sources?.[0]?.docId).toBe('doc-1');
  });
});
