import { describe, it, expect, beforeEach } from 'vitest';
import { dispatchTool } from '../packages/tools/src/dispatcher';
import { registerTool, clearRegistry } from '../packages/tools/src/registry';
import { ToolErrorCode, ToolExecutionError } from '../packages/tools/src/errors';
import { validateToolParameters, type JSONSchema } from '../packages/tools/src/schema';
import type { ToolContext } from '../packages/tools/src/schema';
import type { Env } from '../packages/core/src/env';

function createMockEnv(): Env {
  return {
    AI: {} as Ai,
    VECTORIZE: {} as Vectorize,
    CONFIG: {} as KVNamespace,
    CACHE: {} as KVNamespace,
    RATE_LIMITER: {} as KVNamespace,
    DB: {} as D1Database,
    CHAT_SESSION: {} as DurableObjectNamespace,
    RATE_LIMITER_DO: {} as DurableObjectNamespace,
  };
}

function createMockContext(): ToolContext {
  return {
    tenantId: 'test-tenant',
    requestId: 'req-123',
    env: createMockEnv(),
  };
}

describe('Tool injection guards', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('rejects tool names with path traversal patterns', async () => {
    try {
      await dispatchTool('../../etc/passwd', {}, createMockContext());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolExecutionError);
      expect((err as ToolExecutionError).code).toBe(ToolErrorCode.TOOL_NOT_FOUND);
    }
  });

  it('rejects tool names with special characters', async () => {
    try {
      await dispatchTool('tool<script>', {}, createMockContext());
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ToolExecutionError);
      expect((err as ToolExecutionError).code).toBe(ToolErrorCode.TOOL_NOT_FOUND);
    }
  });

  it('validates __proto__ in params does not cause pollution', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      additionalProperties: false,
    };

    const maliciousParams = JSON.parse(
      '{"text":"hello","__proto__":{"polluted":true}}'
    );
    const result = validateToolParameters(maliciousParams, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('__proto__'))).toBe(true);
  });

  it('handles extremely large text params without crashing', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        text: { type: 'string', maxLength: 100 },
      },
    };

    const largeText = 'x'.repeat(100001);
    const result = validateToolParameters({ text: largeText }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maximum length'))).toBe(true);
  });

  it('rejects non-object params', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    };

    const result = validateToolParameters('not an object', schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Parameters must be an object');
  });

  it('rejects null params', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    };

    const result = validateToolParameters(null, schema);
    expect(result.valid).toBe(false);
  });
});
