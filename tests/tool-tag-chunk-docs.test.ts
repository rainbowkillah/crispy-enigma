import { describe, it, expect } from 'vitest';
import { tagChunkDocsTool } from '../packages/tools/src/builtin/tag_chunk_docs';
import type { ToolContext } from '../packages/tools/src/schema';
import type { Env } from '../packages/core/src/env';

function createMockEnv(tagsResponse: string[]): Env {
  return {
    AI: {
      run: async () => ({
        response: JSON.stringify({ tags: tagsResponse }),
      }),
    } as unknown as Ai,
    VECTORIZE: {} as Vectorize,
    CONFIG: {} as KVNamespace,
    CACHE: {} as KVNamespace,
    RATE_LIMITER: {} as KVNamespace,
    DB: {} as D1Database,
    CHAT_SESSION: {} as DurableObjectNamespace,
    RATE_LIMITER_DO: {} as DurableObjectNamespace,
    MODEL_ID: '@cf/meta/llama-3.1-8b-instruct',
  };
}

function createMockContext(tagsResponse: string[]): ToolContext {
  return {
    tenantId: 'test-tenant',
    requestId: 'req-123',
    env: createMockEnv(tagsResponse),
    aiGatewayId: 'test-gateway',
    chatModelId: '@cf/meta/llama-3.1-8b-instruct',
  };
}

describe('tag_chunk_docs tool', () => {
  it('chunks and tags a document', async () => {
    const ctx = createMockContext(['technology', 'ai', 'research']);
    const result = await tagChunkDocsTool.handler(
      { content: 'This is a document about artificial intelligence and machine learning research.' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.chunk_count).toBeGreaterThan(0);
    expect(result.data?.chunks[0].tags).toEqual(['technology', 'ai', 'research']);
    expect(result.data?.chunks[0].index).toBe(0);
    expect(typeof result.data?.chunks[0].start_offset).toBe('number');
    expect(typeof result.data?.chunks[0].end_offset).toBe('number');
  });

  it('handles empty content', async () => {
    const ctx = createMockContext([]);
    const result = await tagChunkDocsTool.handler(
      { content: '' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.chunks).toEqual([]);
    expect(result.data?.chunk_count).toBe(0);
  });

  it('custom chunk_size is applied', async () => {
    const ctx = createMockContext(['chunk']);
    const longContent = Array.from({ length: 50 }, (_, i) => `Word${i}`).join(' ');
    const result = await tagChunkDocsTool.handler(
      { content: longContent, chunk_size: 100 },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.chunk_count).toBeGreaterThan(1);
    for (const chunk of result.data?.chunks ?? []) {
      expect(chunk.text.length).toBeLessThanOrEqual(100);
    }
  });

  it('has correct tool definition metadata', () => {
    expect(tagChunkDocsTool.name).toBe('tag_chunk_docs');
    expect(tagChunkDocsTool.timeout).toBe(30000);
    expect(tagChunkDocsTool.parameters.required).toContain('content');
  });
});
