import { TenantVectorizeAdapter } from '../../storage/src/vectorize';

export type VectorizeRecordMetadata = {
  tenantId: string;
  docId: string;
  chunkId: string;
  source?: string;
  [key: string]: string | number | boolean | undefined;
};

export type VectorizeUpsertRecord = {
  id: string;
  values: number[];
  metadata: VectorizeRecordMetadata;
};

export type VectorizeUpsertResult = {
  count: number;
  raw: VectorizeAsyncMutation;
};

export type VectorizeSearchOptions = {
  topK?: number;
  filter?: Record<string, string | number | boolean>;
};

export type VectorizeSearchResult = {
  matches: VectorizeMatch[];
  raw: VectorizeMatches;
};

export async function upsertTenantVectors(
  tenantId: string,
  index: Vectorize,
  records: VectorizeUpsertRecord[]
): Promise<VectorizeUpsertResult> {
  if (records.length === 0) {
    return {
      count: 0,
      raw: { count: 0, mutationId: 'noop' } as VectorizeAsyncMutation
    };
  }

  const adapter = new TenantVectorizeAdapter(index);
  const vectors: VectorizeVector[] = records.map((record) => {
    const cleaned = Object.fromEntries(
      Object.entries(record.metadata).filter(([, value]) => value !== undefined)
    ) as Record<string, VectorizeVectorMetadata>;
    return {
      id: record.id,
      values: record.values,
      metadata: cleaned
    };
  });

  const result = await adapter.upsert(tenantId, vectors);
  return { count: records.length, raw: result };
}

export async function searchTenantVectors(
  tenantId: string,
  index: Vectorize,
  vector: number[],
  options: VectorizeSearchOptions = {}
): Promise<VectorizeSearchResult> {
  const adapter = new TenantVectorizeAdapter(index);
  const raw = await adapter.query(tenantId, vector, {
    topK: options.topK ?? 5,
    filter: options.filter
  });

  return {
    matches: raw.matches ?? [],
    raw
  };
}
