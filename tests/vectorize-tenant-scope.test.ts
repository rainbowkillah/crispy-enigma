import { describe, expect, it } from 'vitest';
import { TenantVectorizeAdapter } from '../packages/storage/src/vectorize';

class FakeVectorize {
  public lastQuery?: VectorizeQueryOptions;
  public lastUpsert: VectorizeVector[] = [];

  async query(_vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches> {
    this.lastQuery = options;
    return { matches: [] } as VectorizeMatches;
  }

  async upsert(vectors: VectorizeVector[]): Promise<VectorizeAsyncMutation> {
    this.lastUpsert = vectors;
    return { count: vectors.length } as VectorizeAsyncMutation;
  }
}

describe('TenantVectorizeAdapter', () => {
  it('namespaces queries by tenant', async () => {
    const index = new FakeVectorize();
    const adapter = new TenantVectorizeAdapter(index as unknown as Vectorize);

    await adapter.query('tenant-a', [0.1, 0.2], { topK: 3 });
    expect(index.lastQuery?.namespace).toBe('tenant-a');
    expect(index.lastQuery?.topK).toBe(3);
  });

  it('namespaces upserts by tenant', async () => {
    const index = new FakeVectorize();
    const adapter = new TenantVectorizeAdapter(index as unknown as Vectorize);

    await adapter.upsert('tenant-b', [
      { id: 'v1', values: [0.1, 0.2] },
      { id: 'v2', values: [0.3, 0.4] }
    ]);

    expect(index.lastUpsert).toHaveLength(2);
    expect(index.lastUpsert[0]?.namespace).toBe('tenant-b');
    expect(index.lastUpsert[1]?.namespace).toBe('tenant-b');
  });
});
