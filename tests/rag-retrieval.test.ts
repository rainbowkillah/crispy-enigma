import { describe, expect, it } from 'vitest';
import { runVectorizeRetrieval } from '../packages/rag/src';
import { makeEnv } from './rag-embeddings.test';

class FakeVectorize {
  public lastQuery?: VectorizeQueryOptions;
  async query(_vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches> {
    this.lastQuery = options;
    return {
      matches: [
        {
          id: 'doc-1:chunk-1',
          score: 0.9,
          metadata: { tenantId: 'tenant-a', docId: 'doc-1', chunkId: 'chunk-1' }
        }
      ]
    } as VectorizeMatches;
  }

  upsert(): Promise<VectorizeAsyncMutation> {
    throw new Error('not implemented');
  }
}

describe('runVectorizeRetrieval', () => {
  it('runs embedding then queries Vectorize', async () => {
    const capture: { options?: unknown } = {};
    const env = makeEnv({ data: [{ embedding: [0.1, 0.2, 0.3] }] }, capture);
    const vectorize = new FakeVectorize();
    env.VECTORIZE = vectorize as unknown as Vectorize;

    const result = await runVectorizeRetrieval(
      'tenant-a',
      'gateway-a',
      '@cf/baai/bge-base-en-v1.5',
      { query: 'hello', topK: 3 },
      env
    );

    expect(result.queryEmbedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.matches).toHaveLength(1);
    expect(vectorize.lastQuery?.topK).toBe(3);
    const options = capture.options as {
      gateway?: { id?: string; metadata?: Record<string, string> };
    };
    expect(options.gateway?.id).toBe('gateway-a');
    expect(options.gateway?.metadata?.tenantId).toBe('tenant-a');
  });

  it('applies rerank hook when provided', async () => {
    const env = makeEnv({ data: [{ embedding: [0.1, 0.2, 0.3] }] }, {});
    const vectorize = new FakeVectorize();
    env.VECTORIZE = vectorize as unknown as Vectorize;

    const rerankHook = async ({ matches }: { matches: VectorizeMatch[] }) => ({
      matches: matches.slice().reverse()
    });

    const result = await runVectorizeRetrieval(
      'tenant-a',
      'gateway-a',
      '@cf/baai/bge-base-en-v1.5',
      { query: 'hello', topK: 3 },
      env,
      rerankHook
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.id).toBe('doc-1:chunk-1');
  });
});
