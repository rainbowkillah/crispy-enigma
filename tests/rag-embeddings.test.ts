import { describe, expect, it } from 'vitest';
import { runGatewayEmbeddings } from '../packages/rag/src';
import type { Env } from '../packages/core/src';

function makeEnv(result: unknown, capture: { options?: unknown }): Env {
  const fakeAi = {
    run: async (_modelId: string, _input: unknown, options: unknown) => {
      capture.options = options;
      return result;
    }
  };

  return {
    AI: fakeAi as unknown as Ai,
    VECTORIZE: {} as Vectorize,
    CONFIG: {} as KVNamespace,
    CACHE: {} as KVNamespace,
    RATE_LIMITER: {} as KVNamespace,
    DB: {} as D1Database,
    CHAT_SESSION: {} as DurableObjectNamespace,
    RATE_LIMITER_DO: {} as DurableObjectNamespace
  };
}

describe('runGatewayEmbeddings', () => {
  it('extracts embeddings from data[] shape', async () => {
    const capture: { options?: unknown } = {};
    const env = makeEnv(
      {
        data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }]
      },
      capture
    );

    const result = await runGatewayEmbeddings(
      'tenant-a',
      'gateway-a',
      '@cf/baai/bge-base-en-v1.5',
      ['hello', 'world'],
      env
    );

    expect(result.embeddings).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ]);
    const options = capture.options as {
      gateway?: { id?: string; metadata?: Record<string, string> };
    };
    expect(options.gateway?.id).toBe('gateway-a');
    expect(options.gateway?.metadata?.tenantId).toBe('tenant-a');
  });

  it('extracts embeddings from embeddings[] shape', async () => {
    const env = makeEnv({ embeddings: [[1, 2, 3]] }, {});
    const result = await runGatewayEmbeddings(
      'tenant-a',
      'gateway-a',
      '@cf/baai/bge-base-en-v1.5',
      ['hello'],
      env
    );
    expect(result.embeddings).toEqual([[1, 2, 3]]);
  });

  it('throws when embeddings are missing', async () => {
    const env = makeEnv({ response: 'no embeddings' }, {});
    await expect(
      runGatewayEmbeddings(
        'tenant-a',
        'gateway-a',
        '@cf/baai/bge-base-en-v1.5',
        ['hello'],
        env
      )
    ).rejects.toThrow('Embedding response did not contain vectors');
  });
});
