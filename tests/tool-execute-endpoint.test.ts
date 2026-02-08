import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env } from '../packages/core/src';

function createMockEnv(): Env {
  return {
    AI: {
      run: async () => ({
        response: 'Test summary of the input text.',
      }),
    } as unknown as Ai,
    VECTORIZE: {} as Vectorize,
    CONFIG: {} as KVNamespace,
    CACHE: {
      put: async () => {},
      get: async () => null,
      list: async () => ({ keys: [], list_complete: true, cursor: '' }),
    } as unknown as KVNamespace,
    RATE_LIMITER: {} as KVNamespace,
    DB: {} as D1Database,
    CHAT_SESSION: {} as DurableObjectNamespace,
    RATE_LIMITER_DO: {} as DurableObjectNamespace,
    MAX_REQUEST_BODY_SIZE: 102400,
    MODEL_ID: '@cf/meta/llama-3.1-8b-instruct',
  };
}

const fetchWorker = (
  url: string,
  init: RequestInit,
  env?: Env
) =>
  worker.fetch(new Request(url, init), env ?? createMockEnv());

const json = async (response: Response) =>
  response.json() as Promise<{
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code?: string; message?: string };
  }>;

describe('/tools/execute endpoint', () => {
  it('POST /tools/execute returns tool result', async () => {
    const response = await fetchWorker(
      'https://mrrainbowsmoke.local/tools/execute',
      {
        method: 'POST',
        headers: {
          'x-tenant-id': 'mrrainbowsmoke',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tool_name: 'summarize',
          params: { text: 'This is a long text that needs to be summarized.' },
        }),
      }
    );

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect((body.data as Record<string, unknown>).success).toBe(true);
  });

  it('POST /tools/execute returns 404 for unknown tool', async () => {
    const response = await fetchWorker(
      'https://mrrainbowsmoke.local/tools/execute',
      {
        method: 'POST',
        headers: {
          'x-tenant-id': 'mrrainbowsmoke',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tool_name: 'nonexistent_tool',
          params: {},
        }),
      }
    );

    expect(response.status).toBe(404);
    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('TOOL_NOT_FOUND');
  });

  it('POST /tools/execute with invalid params returns 400', async () => {
    const response = await fetchWorker(
      'https://mrrainbowsmoke.local/tools/execute',
      {
        method: 'POST',
        headers: {
          'x-tenant-id': 'mrrainbowsmoke',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          tool_name: 'summarize',
          params: {}, // missing required 'text'
        }),
      }
    );

    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('POST /tools/execute with missing tool_name returns 400', async () => {
    const response = await fetchWorker(
      'https://mrrainbowsmoke.local/tools/execute',
      {
        method: 'POST',
        headers: {
          'x-tenant-id': 'mrrainbowsmoke',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          params: { text: 'hello' },
        }),
      }
    );

    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('invalid_request');
  });
});

describe('/schema/tools endpoint', () => {
  it('GET /schema/tools returns tool definitions without handlers', async () => {
    const response = await fetchWorker(
      'https://mrrainbowsmoke.local/schema/tools',
      {
        method: 'GET',
        headers: { 'x-tenant-id': 'mrrainbowsmoke' },
      }
    );

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    const tools = (body.data as Record<string, unknown>).tools as Array<Record<string, unknown>>;
    expect(tools.length).toBeGreaterThanOrEqual(5);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('summarize');
    expect(toolNames).toContain('extract_entities');
    expect(toolNames).toContain('classify_intent');
    expect(toolNames).toContain('tag_chunk_docs');
    expect(toolNames).toContain('ingest_docs');

    // Ensure handler is not exposed
    for (const tool of tools) {
      expect(tool.handler).toBeUndefined();
    }
  });

  it('rejects non-GET requests', async () => {
    const response = await fetchWorker(
      'https://mrrainbowsmoke.local/schema/tools',
      {
        method: 'POST',
        headers: { 'x-tenant-id': 'mrrainbowsmoke' },
      }
    );

    expect(response.status).toBe(405);
  });
});

describe('/metrics/tools/execution endpoint', () => {
  it('GET /metrics/tools/execution returns metrics summary', async () => {
    const response = await fetchWorker(
      'https://mrrainbowsmoke.local/metrics/tools/execution',
      {
        method: 'GET',
        headers: { 'x-tenant-id': 'mrrainbowsmoke' },
      }
    );

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect((body.data as Record<string, unknown>).tenantId).toBe('mrrainbowsmoke');
    expect((body.data as Record<string, unknown>).period).toBe('24h');
    expect(typeof (body.data as Record<string, unknown>).totalExecutions).toBe('number');
  });

  it('rejects invalid period', async () => {
    const response = await fetchWorker(
      'https://mrrainbowsmoke.local/metrics/tools/execution?period=30d',
      {
        method: 'GET',
        headers: { 'x-tenant-id': 'mrrainbowsmoke' },
      }
    );

    expect(response.status).toBe(400);
  });
});
