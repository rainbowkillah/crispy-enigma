import { TenantVectorizeAdapter } from '../../storage/src/vectorize';
import { runGatewayEmbeddings } from './embeddings';
import type { Env } from '../../core/src/env';

export type RetrievalRequest = {
  query: string;
  topK?: number;
  filter?: Record<string, string | number | boolean>;
};

export type RerankRequest = {
  query: string;
  matches: VectorizeMatch[];
};

export type RerankResult = {
  matches: VectorizeMatch[];
};

export type RerankHook = (
  request: RerankRequest
) => Promise<RerankResult | VectorizeMatch[]> | RerankResult | VectorizeMatch[];

export type RetrievalResult = {
  modelId: string;
  queryEmbedding: number[];
  matches: VectorizeMatch[];
  raw: VectorizeMatches;
};

export async function runVectorizeRetrieval(
  tenantId: string,
  gatewayId: string,
  embeddingModelId: string,
  request: RetrievalRequest,
  env: Env,
  rerankHook?: RerankHook
): Promise<RetrievalResult> {
  const embeddingResult = await runGatewayEmbeddings(
    tenantId,
    gatewayId,
    embeddingModelId,
    [request.query],
    env,
    {
      metadata: {
        route: '/search',
        query: 'vectorize'
      }
    }
  );

  const vector = embeddingResult.embeddings[0] ?? [];
  if (vector.length === 0) {
    return {
      modelId: embeddingResult.modelId,
      queryEmbedding: [],
      matches: [],
      raw: { matches: [], count: 0 } as VectorizeMatches
    };
  }

  const adapter = new TenantVectorizeAdapter(env.VECTORIZE);
  const raw = await adapter.query(tenantId, vector, {
    topK: request.topK ?? 5,
    filter: request.filter
  });

  const initialMatches = raw.matches ?? [];
  let matches = initialMatches;

  if (rerankHook && initialMatches.length > 0) {
    const reranked = await rerankHook({
      query: request.query,
      matches: initialMatches
    });
    matches = Array.isArray(reranked) ? reranked : reranked.matches;
  }

  return {
    modelId: embeddingResult.modelId,
    queryEmbedding: vector,
    matches,
    raw
  };
}
