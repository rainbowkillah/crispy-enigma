import { describe, it, expect, vi } from 'vitest';
import { ingestDocsTool } from '../packages/tools/src/builtin/ingest_docs';
import type { ToolContext } from '../packages/tools/src/schema';
import type { Env } from '../packages/core/src/env';

function createMockEnv(): Env {
  const upsertedVectors: unknown[] = [];
  return {
    AI: {
      run: async (_model: string, input: unknown) => {
        const texts = (input as { text: string[] }).text;
        return {
          data: texts.map(() => ({
            embedding: Array.from({ length: 768 }, () => Math.random()),
          })),
        };
      },
    } as unknown as Ai,
    VECTORIZE: {
      upsert: async (vectors: unknown[]) => {
        upsertedVectors.push(...vectors);
        return { count: (vectors as unknown[]).length, mutationId: 'test-mutation' };
      },
      _upserted: upsertedVectors,
    } as unknown as Vectorize,
    CONFIG: {} as KVNamespace,
    CACHE: {} as KVNamespace,
    RATE_LIMITER: {} as KVNamespace,
    DB: {} as D1Database,
    CHAT_SESSION: {} as DurableObjectNamespace,
    RATE_LIMITER_DO: {} as DurableObjectNamespace,
    EMBEDDING_MODEL_ID: '@cf/baai/bge-base-en-v1.5',
  };
}

function createMockContext(): ToolContext {
  return {
    tenantId: 'test-tenant',
    requestId: 'req-123',
    env: createMockEnv(),
    aiGatewayId: 'test-gateway',
    embeddingModelId: '@cf/baai/bge-base-en-v1.5',
  };
}

describe('ingest_docs tool', () => {
  it('ingests document, chunks, embeds, and upserts', async () => {
    const ctx = createMockContext();
    const result = await ingestDocsTool.handler(
      {
        content: 'This is a test document with enough words to be chunked and ingested into the vector store for later retrieval.',
        doc_id: 'doc-1',
        source: 'test',
        title: 'Test Doc',
      },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.doc_id).toBe('doc-1');
    expect(result.data?.chunks_ingested).toBeGreaterThan(0);
    expect(result.data?.embedding_model).toBe('@cf/baai/bge-base-en-v1.5');
  });

  it('handles empty content after chunking', async () => {
    const ctx = createMockContext();
    const result = await ingestDocsTool.handler(
      { content: '   ', doc_id: 'doc-empty' },
      ctx
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_CONTENT');
  });

  it('passes metadata through to vectors', async () => {
    const ctx = createMockContext();
    const spy = vi.spyOn(ctx.env.VECTORIZE, 'upsert');
    await ingestDocsTool.handler(
      {
        content: 'Content for metadata test is here and it should be long enough.',
        doc_id: 'doc-meta',
        source: 'wiki',
        title: 'Wiki Article',
        metadata: { category: 'science' },
      },
      ctx
    );

    expect(spy).toHaveBeenCalled();
    const vectors = spy.mock.calls[0][0] as Array<{ metadata: Record<string, unknown> }>;
    expect(vectors[0].metadata.tenantId).toBe('test-tenant');
    expect(vectors[0].metadata.docId).toBe('doc-meta');
    expect(vectors[0].metadata.source).toBe('wiki');
    expect(vectors[0].metadata.category).toBe('science');
  });

  it('has correct tool definition metadata', () => {
    expect(ingestDocsTool.name).toBe('ingest_docs');
    expect(ingestDocsTool.timeout).toBe(60000);
    expect(ingestDocsTool.parameters.required).toContain('content');
    expect(ingestDocsTool.parameters.required).toContain('doc_id');
  });
});
