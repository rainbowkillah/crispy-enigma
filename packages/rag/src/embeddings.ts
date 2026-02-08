import type { Env } from '../../core/src/env';

export type EmbeddingMetadata = Record<string, string | undefined>;

export type RunEmbeddingOptions = {
  metadata?: EmbeddingMetadata;
};

export type EmbeddingResult = {
  modelId: string;
  embeddings: number[][];
  raw: unknown;
};

function buildGatewayOptions(
  tenantId: string,
  gatewayId: string,
  metadata?: EmbeddingMetadata
): { gateway: { id: string; metadata: Record<string, string> } } {
  const cleaned: Record<string, string> = {};
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string' && value.length > 0) {
        cleaned[key] = value;
      }
    }
  }
  cleaned.tenantId = tenantId;

  return {
    gateway: {
      id: gatewayId,
      metadata: cleaned
    }
  };
}

function extractEmbeddingVectors(result: unknown): number[][] | null {
  if (Array.isArray(result)) {
    if (result.every((item) => Array.isArray(item))) {
      return result as number[][];
    }
  }

  if (typeof result !== 'object' || result === null) {
    return null;
  }

  const record = result as Record<string, unknown>;
  const direct = record.embeddings ?? record.embedding ?? record.result;
  if (Array.isArray(direct)) {
    if (direct.every((item) => Array.isArray(item))) {
      return direct as number[][];
    }
    if (direct.every((item) => typeof item === 'number')) {
      return [direct as number[]];
    }
  }

  const data = record.data;
  if (Array.isArray(data) && data.length > 0) {
    const vectors: number[][] = [];
    for (const item of data) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }
      const embedding = (item as Record<string, unknown>).embedding;
      if (Array.isArray(embedding)) {
        vectors.push(embedding as number[]);
      }
    }
    if (vectors.length > 0) {
      return vectors;
    }
  }

  return null;
}

export async function runGatewayEmbeddings(
  tenantId: string,
  gatewayId: string,
  modelId: string,
  texts: string[],
  env: Env,
  options: RunEmbeddingOptions = {}
): Promise<EmbeddingResult> {
  if (texts.length === 0) {
    return { modelId, embeddings: [], raw: [] };
  }

  const input = { text: texts } as unknown;
  
  // Note: AI Gateway doesn't support embeddings properly (expects chat format)
  // Use direct Workers AI for embeddings instead
  const runOptions = {} as unknown;

  const result = await (
    env.AI as unknown as {
      run: (model: string, input: unknown, options: unknown) => Promise<unknown>;
    }
  ).run(modelId, input, runOptions);

  const embeddings = extractEmbeddingVectors(result);
  if (!embeddings) {
    throw new Error('Embedding response did not contain vectors');
  }

  return {
    modelId,
    embeddings,
    raw: result
  };
}
