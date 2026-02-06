import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env } from '../packages/core/src';

const baseEnv: Env = {
  AI: {} as Ai,
  VECTORIZE: {} as Vectorize,
  CONFIG: {} as KVNamespace,
  CACHE: {} as KVNamespace,
  RATE_LIMITER: {} as KVNamespace,
  DB: {} as D1Database,
  CHAT_SESSION: {} as DurableObjectNamespace,
  RATE_LIMITER_DO: {} as DurableObjectNamespace,
  MAX_REQUEST_BODY_SIZE: 4
};

describe('request size limits', () => {
  it('rejects bodies larger than MAX_REQUEST_BODY_SIZE', async () => {
    const request = new Request('https://example.local/health', {
      method: 'POST',
      headers: {
        'x-tenant-id': 'example'
      },
      body: '012345'
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(413);
  });

  it('accepts bodies within MAX_REQUEST_BODY_SIZE', async () => {
    const request = new Request('https://example.local/health', {
      method: 'POST',
      headers: {
        'x-tenant-id': 'example'
      },
      body: '0123'
    });

    const response = await worker.fetch(request, baseEnv);
    expect(response.status).toBe(200);
  });
});
