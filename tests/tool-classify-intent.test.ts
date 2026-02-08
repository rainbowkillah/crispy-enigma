import { describe, it, expect } from 'vitest';
import { classifyIntentTool } from '../packages/tools/src/builtin/classify_intent';
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

describe('classify_intent tool', () => {
  it('classifies intent with default categories', async () => {
    const aiJson = JSON.stringify({ intent: 'question', confidence: 0.92 });
    const ctx = createMockContext(aiJson);
    const result = await classifyIntentTool.handler(
      { text: 'What is the weather today?' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('question');
    expect(result.data?.confidence).toBeCloseTo(0.92);
    expect(result.data?.categories_considered).toContain('question');
    expect(result.data?.categories_considered).toContain('request');
  });

  it('classifies with custom categories', async () => {
    const aiJson = JSON.stringify({ intent: 'purchase', confidence: 0.85 });
    const ctx = createMockContext(aiJson);
    const result = await classifyIntentTool.handler(
      { text: 'I want to buy a laptop', categories: ['purchase', 'support', 'info'] },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('purchase');
    expect(result.data?.categories_considered).toEqual(['purchase', 'support', 'info']);
  });

  it('handles missing confidence in response', async () => {
    const aiJson = JSON.stringify({ intent: 'greeting' });
    const ctx = createMockContext(aiJson);
    const result = await classifyIntentTool.handler(
      { text: 'Hello!' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('greeting');
    expect(result.data?.confidence).toBe(0);
  });

  it('falls back to other for non-matching intent', async () => {
    const aiJson = JSON.stringify({ intent: 'unknown_category', confidence: 0.5 });
    const ctx = createMockContext(aiJson);
    const result = await classifyIntentTool.handler(
      { text: 'Something random' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('other');
  });

  it('handles malformed JSON from AI', async () => {
    const ctx = createMockContext('not json');
    const result = await classifyIntentTool.handler(
      { text: 'Some text' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.intent).toBe('other');
    expect(result.data?.confidence).toBe(0);
  });

  it('has correct tool definition metadata', () => {
    expect(classifyIntentTool.name).toBe('classify_intent');
    expect(classifyIntentTool.timeout).toBe(30000);
    expect(classifyIntentTool.parameters.required).toContain('text');
  });
});
