import { describe, it, expect } from 'vitest';
import { runVectorizeRetrieval } from '../packages/rag/src';
import { makeEnv } from './rag-embeddings.test';

// Simple dot product
function dot(a: number[], b: number[]) {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

class MemoryVectorize {
  private vectors: { id: string; values: number[]; metadata: Record<string, unknown> }[] = [];

  constructor(vectors: { id: string; values: number[]; metadata: Record<string, unknown> }[]) {
    this.vectors = vectors;
  }

  async query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches> {
    const scored = this.vectors.map(v => ({
      ...v,
      score: dot(v.values, vector)
    }));
    
    // Filter by tenant if metadata filter is present?
    // The TenantVectorizeAdapter handles tenant ID injection into ID or metadata.
    // Here we simulate the raw Vectorize behavior.
    
    scored.sort((a, b) => b.score - a.score);
    const topK = options?.topK ?? 5;
    
    return {
      matches: scored.slice(0, topK),
      count: scored.length
    } as VectorizeMatches;
  }
}

describe('Retrieval Quality Smoke Test', () => {
  it('retrieves the most relevant document', async () => {
    const docA = { id: 'doc-a', values: [1, 0, 0], metadata: { text: 'Apple' } };
    const docB = { id: 'doc-b', values: [0, 1, 0], metadata: { text: 'Banana' } };
    const docC = { id: 'doc-c', values: [0, 0, 1], metadata: { text: 'Cherry' } };
    
    const vectorize = new MemoryVectorize([docA, docB, docC]);
    
    // Query close to Apple
    const envApple = makeEnv({ data: [{ embedding: [0.9, 0.1, 0] }] }, {});
    envApple.VECTORIZE = vectorize as unknown as Vectorize;
    
    const resultApple = await runVectorizeRetrieval('t', 'g', 'm', { query: 'fruit' }, envApple);
    expect(resultApple.matches[0].id).toBe('doc-a');

    // Query close to Banana
    const envBanana = makeEnv({ data: [{ embedding: [0.1, 0.9, 0] }] }, {});
    envBanana.VECTORIZE = vectorize as unknown as Vectorize;
    
    const resultBanana = await runVectorizeRetrieval('t', 'g', 'm', { query: 'fruit' }, envBanana);
    expect(resultBanana.matches[0].id).toBe('doc-b');
  });
});
