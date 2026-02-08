/**
 * Tool Schema & Validation
 *
 * Defines the structure for function/tool execution system.
 * Uses JSON Schema (OpenAPI 3.0.0 compatible) for parameter definitions.
 */

import { z } from 'zod';
import type { Env } from '../../core/src/env.js';

/**
 * JSON Schema types (simplified for tool parameters)
 * Supports OpenAPI 3.0.0 parameter schema format
 */
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array';

export interface JSONSchemaProperty {
  type: JSONSchemaType;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  format?: string;
  items?: JSONSchemaProperty; // For array types
  properties?: Record<string, JSONSchemaProperty>; // For object types
  required?: string[]; // For object types
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Tool execution context
 */
export interface ToolContext {
  tenantId: string;
  requestId: string;
  userId?: string;
  env: Env;
}

/**
 * Tool execution result
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    durationMs: number;
    tokensUsed?: number;
    cacheHit?: boolean;
  };
}

/**
 * Tool definition
 */
export interface ToolDefinition<TParams = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: JSONSchema;
  output: JSONSchema;
  handler: (params: TParams, context: ToolContext) => Promise<ToolResult<TOutput>>;
  timeout?: number; // milliseconds, default 10000
  permissions?: string[]; // Optional: required permissions to execute
}

/**
 * Zod schema for tool definition validation
 */
const JSONSchemaPropertySchema: z.ZodType<JSONSchemaProperty> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'integer', 'boolean', 'object', 'array']),
    description: z.string().optional(),
    default: z.unknown().optional(),
    enum: z.array(z.unknown()).optional(),
    format: z.string().optional(),
    items: JSONSchemaPropertySchema.optional(),
    properties: z.record(JSONSchemaPropertySchema).optional(),
    required: z.array(z.string()).optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
  })
);

export const JSONSchemaSchema = z.object({
  type: z.literal('object'),
  properties: z.record(JSONSchemaPropertySchema),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
});

export const ToolDefinitionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Tool name must be lowercase alphanumeric with underscores'),
  description: z.string().min(10).max(500),
  parameters: JSONSchemaSchema,
  output: JSONSchemaSchema,
  handler: z.function(),
  timeout: z.number().min(1000).max(60000).optional().default(10000),
  permissions: z.array(z.string()).optional(),
});

/**
 * Validate a tool definition
 */
export function validateToolDefinition(tool: unknown): ToolDefinition {
  return ToolDefinitionSchema.parse(tool) as ToolDefinition;
}

/**
 * Validate tool parameters against JSON Schema
 *
 * @param params - Parameters to validate
 * @param schema - JSON Schema definition
 * @returns Validation result with errors if any
 */
export function validateToolParameters(
  params: unknown,
  schema: JSONSchema
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof params !== 'object' || params === null) {
    return { valid: false, errors: ['Parameters must be an object'] };
  }

  const paramObj = params as Record<string, unknown>;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in paramObj)) {
        errors.push(`Missing required parameter: ${field}`);
      }
    }
  }

  // Validate each parameter
  for (const [key, value] of Object.entries(paramObj)) {
    const propSchema = schema.properties[key];

    if (!propSchema) {
      if (schema.additionalProperties === false) {
        errors.push(`Unexpected parameter: ${key}`);
      }
      continue;
    }

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    const expectedType = propSchema.type === 'integer' ? 'number' : propSchema.type;

    if (actualType !== expectedType) {
      errors.push(`Parameter '${key}': expected ${propSchema.type}, got ${actualType}`);
      continue;
    }

    // Additional validations
    if (propSchema.type === 'string' && typeof value === 'string') {
      if (propSchema.minLength && value.length < propSchema.minLength) {
        errors.push(`Parameter '${key}': minimum length is ${propSchema.minLength}`);
      }
      if (propSchema.maxLength && value.length > propSchema.maxLength) {
        errors.push(`Parameter '${key}': maximum length is ${propSchema.maxLength}`);
      }
      if (propSchema.enum && !propSchema.enum.includes(value)) {
        errors.push(`Parameter '${key}': must be one of ${propSchema.enum.join(', ')}`);
      }
    }

    if ((propSchema.type === 'number' || propSchema.type === 'integer') && typeof value === 'number') {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        errors.push(`Parameter '${key}': minimum value is ${propSchema.minimum}`);
      }
      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        errors.push(`Parameter '${key}': maximum value is ${propSchema.maximum}`);
      }
      if (propSchema.type === 'integer' && !Number.isInteger(value)) {
        errors.push(`Parameter '${key}': must be an integer`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
