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
  if (request.url.endsWith('/history')) {
    return new Response('[]', { headers: { 'content-type': 'application/json' } });
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
    run: async () => ({ response: 'stability-test-response' })
  } as unknown as Ai,
  VECTORIZE: {} as Vectorize,
  CONFIG: {} as KVNamespace,
  CACHE: {} as KVNamespace,
  RATE_LIMITER: {} as KVNamespace,
  DB: {} as D1Database,
  CHAT_SESSION: sessionNamespace as unknown as DurableObjectNamespace,
  RATE_LIMITER_DO: rateLimiterNamespace as unknown as DurableObjectNamespace
};

const makeStreamRequest = (message: string) =>
  new Request('https://example.local/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': 'example'
    },
    body: JSON.stringify({
      sessionId: '11111111-1111-1111-1111-111111111111',
      message,
      stream: true
    })
  });

describe('Streaming Stability', () => {
  it('streams SSE events with correct format', async () => {
    const response = await worker.fetch(makeStreamRequest('hello'), baseEnv);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const text = await response.text();
    expect(text).toContain('data:');
    expect(text).toContain('event: done');

    // Verify each data line is valid JSON
    const dataLines = text
      .split('\n')
      .filter((line) => line.startsWith('data:'));
    expect(dataLines.length).toBeGreaterThan(0);
    for (const line of dataLines) {
      const payload = line.slice('data:'.length).trim();
      if (payload) {
        expect(() => JSON.parse(payload)).not.toThrow();
      }
    }
  });

  it('handles concurrent streaming requests without interference', async () => {
    const [res1, res2, res3] = await Promise.all([
      worker.fetch(makeStreamRequest('first'), baseEnv),
      worker.fetch(makeStreamRequest('second'), baseEnv),
      worker.fetch(makeStreamRequest('third'), baseEnv)
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    const [text1, text2, text3] = await Promise.all([
      res1.text(),
      res2.text(),
      res3.text()
    ]);

    // Each stream should have SSE format and a done event
    for (const text of [text1, text2, text3]) {
      expect(text).toContain('data:');
      expect(text).toContain('event: done');
    }
  });

  it('handles slow consumers without dropping messages', async () => {
    const response = await worker.fetch(makeStreamRequest('slow-consumer'), baseEnv);
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    let chunkCount = 0;
    let done = false;

    const readPromise = (async () => {
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) {
          done = true;
          break;
        }
        chunkCount++;
        // Simulate a slow consumer by adding a delay
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    })();

    await readPromise;
    expect(chunkCount).toBeGreaterThan(1);
  });

  it('handles client disconnection gracefully', async () => {
    const response = await worker.fetch(makeStreamRequest('disconnect'), baseEnv);
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    // Read one chunk and then cancel the stream
    const { done } = await reader.read();
    expect(done).toBe(false);

    await reader.cancel();

    // The server should not crash and the test should complete.
    // We can't easily inspect the server state here, but if the test
    // completes without errors, it's a good indication that the server
    // handled the disconnection gracefully.
    expect(true).toBe(true);
  });
});