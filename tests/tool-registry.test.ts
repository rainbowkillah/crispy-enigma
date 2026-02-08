/**
 * Tests for tool registry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerTool,
  getTool,
  hasTool,
  listTools,
  listToolNames,
  unregisterTool,
  clearRegistry,
  getRegistrySize,
} from '../packages/tools/src/registry.js';
import type { ToolDefinition } from '../packages/tools/src/schema.js';

describe('Tool Registry', () => {
  beforeEach(() => {
    // Clear registry before each test
    clearRegistry();
  });

  const createTestTool = (name: string): ToolDefinition => ({
    name,
    description: 'A test tool for validation purposes',
    parameters: {
      type: 'object' as const,
      properties: {
        text: { type: 'string' as const },
      },
    },
    output: {
      type: 'object' as const,
      properties: {
        result: { type: 'string' as const },
      },
    },
    handler: async () => ({ success: true, data: { result: 'test' } }),
    timeout: 5000,
  });

  it('registers a tool successfully', () => {
    const tool = createTestTool('test_tool');
    registerTool(tool);

    expect(hasTool('test_tool')).toBe(true);
    expect(getRegistrySize()).toBe(1);
  });

  it('retrieves a registered tool', () => {
    const tool = createTestTool('test_tool');
    registerTool(tool);

    const retrieved = getTool('test_tool');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('test_tool');
    expect(retrieved?.timeout).toBe(5000);
  });

  it('returns undefined for non-existent tool', () => {
    const retrieved = getTool('nonexistent');
    expect(retrieved).toBeUndefined();
  });

  it('prevents duplicate tool registration', () => {
    const tool1 = createTestTool('test_tool');
    const tool2 = createTestTool('test_tool');

    registerTool(tool1);
    expect(() => registerTool(tool2)).toThrow(/already registered/);
  });

  it('lists all registered tools', () => {
    const tool1 = createTestTool('tool_one');
    const tool2 = createTestTool('tool_two');
    const tool3 = createTestTool('tool_three');

    registerTool(tool1);
    registerTool(tool2);
    registerTool(tool3);

    const tools = listTools();
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name).sort()).toEqual(['tool_one', 'tool_three', 'tool_two']);
  });

  it('lists tool names only', () => {
    registerTool(createTestTool('tool_one'));
    registerTool(createTestTool('tool_two'));

    const names = listToolNames();
    expect(names).toHaveLength(2);
    expect(names.sort()).toEqual(['tool_one', 'tool_two']);
  });

  it('unregisters a tool', () => {
    const tool = createTestTool('test_tool');
    registerTool(tool);
    expect(hasTool('test_tool')).toBe(true);

    const removed = unregisterTool('test_tool');
    expect(removed).toBe(true);
    expect(hasTool('test_tool')).toBe(false);
    expect(getRegistrySize()).toBe(0);
  });

  it('returns false when unregistering non-existent tool', () => {
    const removed = unregisterTool('nonexistent');
    expect(removed).toBe(false);
  });

  it('clears the entire registry', () => {
    registerTool(createTestTool('tool_one'));
    registerTool(createTestTool('tool_two'));
    registerTool(createTestTool('tool_three'));

    expect(getRegistrySize()).toBe(3);

    clearRegistry();
    expect(getRegistrySize()).toBe(0);
    expect(listTools()).toHaveLength(0);
  });

  it('validates tool definition on registration', () => {
    const invalidTool = {
      name: 'InvalidName', // Uppercase not allowed
      description: 'Test tool',
      parameters: { type: 'object' as const, properties: {} },
      output: { type: 'object' as const, properties: {} },
      handler: async () => ({ success: true }),
    };

    expect(() => registerTool(invalidTool as ToolDefinition)).toThrow();
  });
});
