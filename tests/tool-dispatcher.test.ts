import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchTool } from '../packages/tools/src/dispatcher';
import { registerTool, clearRegistry } from '../packages/tools/src/registry';
import { ToolErrorCode, ToolExecutionError } from '../packages/tools/src/errors';
import type { ToolDefinition, ToolContext } from '../packages/tools/src/schema';
import type { Env } from '../packages/core/src/env';

function createMockEnv(): Env {
  return {
    AI: {} as Ai,
    VECTORIZE: {} as Vectorize,
    CONFIG: {} as KVNamespace,
    CACHE: { put: async () => {}, get: async () => null, list: async () => ({ keys: [], list_complete: true, cursor: '' }) } as unknown as KVNamespace,
    RATE_LIMITER: {} as KVNamespace,
    DB: {} as D1Database,
    CHAT_SESSION: {} as DurableObjectNamespace,
    RATE_LIMITER_DO: {} as DurableObjectNamespace,
  };
}

function createMockContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    tenantId: 'test-tenant',
    requestId: 'req-123',
    env: createMockEnv(),
    ...overrides,
  };
}

function createTestTool(overrides?: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: 'test_tool',
    description: 'A test tool for dispatcher tests',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1 },
      },
      required: ['text'],
    },
    output: {
      type: 'object',
      properties: {
        result: { type: 'string' },
      },
    },
    handler: async () => ({
      success: true,
      data: { result: 'ok' },
    }),
    timeout: 5000,
    ...overrides,
  };
}

describe('dispatchTool', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('dispatches a registered tool successfully', async () => {
    registerTool(createTestTool());
    const result = await dispatchTool('test_tool', { text: 'hello' }, createMockContext());

    expect(result.toolName).toBe('test_tool');
    expect(result.result.success).toBe(true);
    expect(result.result.data).toEqual({ result: 'ok' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.result.metadata?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws TOOL_NOT_FOUND for unknown tool', async () => {
    try {
      await dispatchTool('nonexistent', {}, createMockContext());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolExecutionError);
      expect((err as ToolExecutionError).code).toBe(ToolErrorCode.TOOL_NOT_FOUND);
    }
  });

  it('throws VALIDATION_FAILED for bad params', async () => {
    registerTool(createTestTool());
    try {
      await dispatchTool('test_tool', {}, createMockContext()); // missing required 'text'
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolExecutionError);
      expect((err as ToolExecutionError).code).toBe(ToolErrorCode.VALIDATION_FAILED);
    }
  });

  it('throws PERMISSION_DENIED when feature flag denies tool', async () => {
    registerTool(createTestTool());
    const ctx = createMockContext({
      featureFlags: { tools_enabled: false },
    });
    try {
      await dispatchTool('test_tool', { text: 'hello' }, ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolExecutionError);
      expect((err as ToolExecutionError).code).toBe(ToolErrorCode.PERMISSION_DENIED);
    }
  });

  it('handles tool execution timeout', async () => {
    const slowTool = createTestTool({
      name: 'slow_tool',
      handler: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { success: true, data: { result: 'late' } };
      },
      timeout: 5000,
    });
    registerTool(slowTool);

    try {
      await dispatchTool('slow_tool', { text: 'hello' }, createMockContext(), {
        timeoutMs: 1000,
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolExecutionError);
      expect((err as ToolExecutionError).code).toBe(ToolErrorCode.EXECUTION_TIMEOUT);
    }
  });

  it('handles tool handler throwing an error', async () => {
    const failingTool = createTestTool({
      name: 'failing_tool',
      handler: async () => {
        throw new Error('Handler crashed');
      },
    });
    registerTool(failingTool);

    try {
      await dispatchTool('failing_tool', { text: 'hello' }, createMockContext());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolExecutionError);
      expect((err as ToolExecutionError).code).toBe(ToolErrorCode.EXECUTION_ERROR);
      expect((err as ToolExecutionError).message).toBe('Handler crashed');
    }
  });

  it('includes durationMs in result metadata', async () => {
    registerTool(createTestTool());
    const result = await dispatchTool('test_tool', { text: 'hello' }, createMockContext());

    expect(result.result.metadata).toBeDefined();
    expect(typeof result.result.metadata?.durationMs).toBe('number');
    expect(result.result.metadata?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
