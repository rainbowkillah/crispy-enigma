import { describe, expect, it } from 'vitest';
import { searchTenantVectors, upsertTenantVectors } from '../packages/rag/src';

function assertMetadataShape(metadata: Record<string, unknown>) {
  expect(metadata.tenantId).toBeTypeOf('string');
  expect(metadata.docId).toBeTypeOf('string');
  expect(metadata.chunkId).toBeTypeOf('string');
}

class FakeVectorize {
  public lastVectors: VectorizeVector[] = [];
  public lastQuery?: VectorizeQueryOptions;
  async upsert(vectors: VectorizeVector[]): Promise<VectorizeAsyncMutation> {
    this.lastVectors = vectors;
    return { count: vectors.length } as VectorizeAsyncMutation;
  }

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
}

describe('upsertTenantVectors', () => {
  it('applies tenant namespace and preserves metadata', async () => {
    const index = new FakeVectorize();
    const result = await upsertTenantVectors('tenant-a', index as unknown as Vectorize, [
      {
        id: 'doc-1:chunk-1',
        values: [0.1, 0.2],
        metadata: {
          tenantId: 'tenant-a',
          docId: 'doc-1',
          chunkId: 'chunk-1',
          source: 'unit-test'
        }
      }
    ]);

    expect(result.count).toBe(1);
    expect(index.lastVectors).toHaveLength(1);
    expect(index.lastVectors[0]?.namespace).toBe('tenant-a');
    expect(index.lastVectors[0]?.metadata).toMatchObject({
      tenantId: 'tenant-a',
      docId: 'doc-1',
      chunkId: 'chunk-1',
      source: 'unit-test'
    });
  });

  it('queries with topK and filter', async () => {
    const index = new FakeVectorize();
    const result = await searchTenantVectors(
      'tenant-a',
      index as unknown as Vectorize,
      [0.1, 0.2],
      { topK: 7, filter: { docId: 'doc-1' } }
    );

    expect(result.matches).toHaveLength(1);
    expect(index.lastQuery?.topK).toBe(7);
    expect(index.lastQuery?.filter).toEqual({ docId: 'doc-1' });
  });

  it('ensures metadata integrity on upsert records', async () => {
    const index = new FakeVectorize();
    await upsertTenantVectors('tenant-a', index as unknown as Vectorize, [
      {
        id: 'doc-1:chunk-1',
        values: [0.1, 0.2],
        metadata: {
          tenantId: 'tenant-a',
          docId: 'doc-1',
          chunkId: 'chunk-1',
          source: 'unit-test'
        }
      }
    ]);

    const metadata = index.lastVectors[0]?.metadata as Record<string, unknown>;
    assertMetadataShape(metadata);
  });
});
