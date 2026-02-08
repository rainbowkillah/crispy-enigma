import { describe, it, expect } from 'vitest';
import { extractEntitiesTool } from '../packages/tools/src/builtin/extract_entities';
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

describe('extract_entities tool', () => {
  it('extracts entities from text', async () => {
    const aiJson = JSON.stringify({
      entities: [
        { text: 'John', type: 'person', start_offset: 0, end_offset: 4 },
        { text: 'New York', type: 'location', start_offset: 14, end_offset: 22 },
      ],
    });
    const ctx = createMockContext(aiJson);
    const result = await extractEntitiesTool.handler(
      { text: 'John lives in New York' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.count).toBe(2);
    expect(result.data?.entities[0].text).toBe('John');
    expect(result.data?.entities[0].type).toBe('person');
    expect(result.data?.entities[1].text).toBe('New York');
  });

  it('handles custom entity_types', async () => {
    const aiJson = JSON.stringify({
      entities: [
        { text: 'Acme Corp', type: 'organization', start_offset: 0, end_offset: 9 },
      ],
    });
    const ctx = createMockContext(aiJson);
    const result = await extractEntitiesTool.handler(
      { text: 'Acme Corp is a company', entity_types: ['organization'] },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.count).toBe(1);
    expect(result.data?.entities[0].type).toBe('organization');
  });

  it('handles empty response from AI', async () => {
    const ctx = createMockContext('{}');
    const result = await extractEntitiesTool.handler(
      { text: 'Some text with no entities' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.count).toBe(0);
    expect(result.data?.entities).toEqual([]);
  });

  it('handles malformed JSON from AI', async () => {
    const ctx = createMockContext('not valid json at all');
    const result = await extractEntitiesTool.handler(
      { text: 'Some text' },
      ctx
    );

    expect(result.success).toBe(true);
    expect(result.data?.count).toBe(0);
    expect(result.data?.entities).toEqual([]);
  });

  it('has correct tool definition metadata', () => {
    expect(extractEntitiesTool.name).toBe('extract_entities');
    expect(extractEntitiesTool.timeout).toBe(30000);
    expect(extractEntitiesTool.parameters.required).toContain('text');
  });
});
