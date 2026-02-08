import { describe, it, expect } from 'vitest';
import { summarizeTool } from '../packages/tools/src/builtin/summarize';
import type { ToolContext } from '../packages/tools/src/schema';
import type { Env } from '../packages/core/src/env';

function createMockEnv(aiResponse: string): Env {
  return {
    AI: {
      run: async () => ({ response: aiResponse }),
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

function createMockContext(aiResponse: string): ToolContext {
  return {
    tenantId: 'test-tenant',
    requestId: 'req-123',
    env: createMockEnv(aiResponse),
    aiGatewayId: 'test-gateway',
    chatModelId: '@cf/meta/llama-3.1-8b-instruct',
  };
}

describe('summarize tool', () => {
  it('returns summary in paragraph format', async () => {
    const ctx = createMockContext('This is a concise summary of the text.');
    const result = await summarizeTool.handler(
      { text: 'Some long text to summarize...', format: 'paragraph' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.summary).toBe('This is a concise summary of the text.');
    expect(result.data?.format).toBe('paragraph');
  });

  it('returns summary in bullet_points format', async () => {
    const ctx = createMockContext('- Point 1\n- Point 2');
    const result = await summarizeTool.handler(
      { text: 'Some text to summarize...', format: 'bullet_points' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.format).toBe('bullet_points');
    expect(result.data?.summary).toContain('Point 1');
  });

  it('handles missing optional params with defaults', async () => {
    const ctx = createMockContext('Default summary.');
    const result = await summarizeTool.handler(
      { text: 'Some text to summarize...' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.format).toBe('paragraph');
    expect(result.data?.summary).toBe('Default summary.');
  });

  it('has correct tool definition metadata', () => {
    expect(summarizeTool.name).toBe('summarize');
    expect(summarizeTool.timeout).toBe(30000);
    expect(summarizeTool.parameters.required).toContain('text');
  });
});
