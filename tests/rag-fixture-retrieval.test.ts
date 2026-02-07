import { describe, expect, it } from 'vitest';
import { runVectorizeRetrieval } from '../packages/rag/src';
import { makeEnv } from './rag-embeddings.test';

class DeterministicVectorize {
  async query(): Promise<VectorizeMatches> {
    const matches = [
      {
        id: 'doc-1:chunk-1',
        score: 0.9,
        metadata: { tenantId: 'tenant-a', docId: 'doc-1', chunkId: 'chunk-1' }
      },
      {
        id: 'doc-2:chunk-3',
        score: 0.8,
        metadata: { tenantId: 'tenant-a', docId: 'doc-2', chunkId: 'chunk-3' }
      }
    ];
    return {
      matches,
      count: matches.length
    } as VectorizeMatches;
  }

  upsert(): Promise<VectorizeAsyncMutation> {
    throw new Error('not implemented');
  }
}

describe('deterministic retrieval fixtures', () => {
  it('returns stable fixture matches', async () => {
    const env = makeEnv({ data: [{ embedding: [0.1, 0.2, 0.3] }] }, {});
    env.VECTORIZE = new DeterministicVectorize() as unknown as Vectorize;

    const result = await runVectorizeRetrieval(
      'tenant-a',
      'gateway-a',
      '@cf/baai/bge-base-en-v1.5',
      { query: 'fixture', topK: 2 },
      env
    );

    expect(result.matches.map((m) => m.id)).toEqual([
      'doc-1:chunk-1',
      'doc-2:chunk-3'
    ]);
  });
});
