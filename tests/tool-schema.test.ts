/**
 * Tests for tool schema validation
 */

import { describe, it, expect } from 'vitest';
import {
  validateToolDefinition,
  validateToolParameters,
  type ToolDefinition,
  type JSONSchema,
} from '../packages/tools/src/schema.js';

describe('Tool Schema Validation', () => {
  it('validates a valid tool definition', () => {
    const tool = {
      name: 'test_tool',
      description: 'A test tool for validation',
      parameters: {
        type: 'object' as const,
        properties: {
          text: {
            type: 'string' as const,
            description: 'Input text',
          },
        },
        required: ['text'],
      },
      output: {
        type: 'object' as const,
        properties: {
          result: {
            type: 'string' as const,
          },
        },
      },
      handler: async () => ({ success: true, data: { result: 'test' } }),
      timeout: 5000,
    };

    const validated = validateToolDefinition(tool);
    expect(validated.name).toBe('test_tool');
    expect(validated.timeout).toBe(5000);
  });

  it('rejects tool with invalid name format', () => {
    const tool = {
      name: 'TestTool', // Invalid: uppercase
      description: 'A test tool for validation',
      parameters: {
        type: 'object' as const,
        properties: {},
      },
      output: {
        type: 'object' as const,
        properties: {},
      },
      handler: async () => ({ success: true }),
    };

    expect(() => validateToolDefinition(tool)).toThrow();
  });

  it('rejects tool with too short description', () => {
    const tool = {
      name: 'test_tool',
      description: 'Short', // Too short (< 10 chars)
      parameters: {
        type: 'object' as const,
        properties: {},
      },
      output: {
        type: 'object' as const,
        properties: {},
      },
      handler: async () => ({ success: true }),
    };

    expect(() => validateToolDefinition(tool)).toThrow();
  });

  it('applies default timeout if not provided', () => {
    const tool = {
      name: 'test_tool',
      description: 'A test tool for validation',
      parameters: {
        type: 'object' as const,
        properties: {},
      },
      output: {
        type: 'object' as const,
        properties: {},
      },
      handler: async () => ({ success: true }),
    };

    const validated = validateToolDefinition(tool);
    expect(validated.timeout).toBe(10000); // Default
  });

  it('validates tool parameters against schema', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
        },
        count: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['text'],
    };

    const validParams = { text: 'Hello', count: 5 };
    const result = validateToolParameters(validParams, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects missing required parameters', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
        required_field: { type: 'string' },
      },
      required: ['required_field'],
    };

    const params = { text: 'Hello' };
    const result = validateToolParameters(params, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: required_field');
  });

  it('detects type mismatches', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        count: { type: 'number' },
      },
    };

    const params = { count: 'not a number' };
    const result = validateToolParameters(params, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('expected number'))).toBe(true);
  });

  it('validates string length constraints', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          minLength: 5,
          maxLength: 10,
        },
      },
    };

    const tooShort = validateToolParameters({ text: 'Hi' }, schema);
    expect(tooShort.valid).toBe(false);

    const tooLong = validateToolParameters({ text: 'This is way too long' }, schema);
    expect(tooLong.valid).toBe(false);

    const justRight = validateToolParameters({ text: 'Perfect' }, schema);
    expect(justRight.valid).toBe(true);
  });

  it('validates numeric range constraints', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
      },
    };

    const tooLow = validateToolParameters({ score: -5 }, schema);
    expect(tooLow.valid).toBe(false);

    const tooHigh = validateToolParameters({ score: 150 }, schema);
    expect(tooHigh.valid).toBe(false);

    const valid = validateToolParameters({ score: 75 }, schema);
    expect(valid.valid).toBe(true);
  });

  it('validates integer type (not float)', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        count: { type: 'integer' },
      },
    };

    const float = validateToolParameters({ count: 5.5 }, schema);
    expect(float.valid).toBe(false);
    expect(float.errors.some(e => e.includes('must be an integer'))).toBe(true);

    const integer = validateToolParameters({ count: 5 }, schema);
    expect(integer.valid).toBe(true);
  });

  it('validates enum constraints', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'pending'],
        },
      },
    };

    const invalid = validateToolParameters({ status: 'unknown' }, schema);
    expect(invalid.valid).toBe(false);

    const valid = validateToolParameters({ status: 'active' }, schema);
    expect(valid.valid).toBe(true);
  });
});
