export class TenantVectorizeAdapter {
  constructor(private index: Vectorize) {}

  async query(
    tenantId: string,
    vector: number[],
    options: Omit<VectorizeQueryOptions, 'vector' | 'namespace'> = {}
  ) {
    return this.index.query(vector, {
      ...options,
      namespace: tenantId
    });
  }

  async upsert(
    tenantId: string,
    vectors: VectorizeVector[]
  ): Promise<VectorizeAsyncMutation> {
    const namespaced = vectors.map((vector) => ({
      ...vector,
      namespace: tenantId
    }));

    return this.index.upsert(namespaced);
  }
}
