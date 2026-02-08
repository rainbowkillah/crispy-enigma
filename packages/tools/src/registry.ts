/**
 * Tool Registry
 *
 * Central registry for all available tools.
 * Supports registration, lookup, and listing of tools.
 */

import type { ToolDefinition } from './schema.js';
import { validateToolDefinition } from './schema.js';

/**
 * Tool registry (in-memory)
 * Key: tool name, Value: tool definition
 */
const registry = new Map<string, ToolDefinition>();

/**
 * Register a tool
 *
 * @param tool - Tool definition to register
 * @throws Error if tool name already exists or validation fails
 */
export function registerTool(tool: ToolDefinition): void {
  // Validate tool definition
  const validated = validateToolDefinition(tool);

  // Check for duplicates
  if (registry.has(validated.name)) {
    throw new Error(`Tool '${validated.name}' is already registered`);
  }

  registry.set(validated.name, validated);
}

/**
 * Get a tool by name
 *
 * @param name - Tool name
 * @returns Tool definition, or undefined if not found
 */
export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

/**
 * Check if a tool exists
 *
 * @param name - Tool name
 * @returns true if tool is registered
 */
export function hasTool(name: string): boolean {
  return registry.has(name);
}

/**
 * List all registered tools
 *
 * @returns Array of tool definitions
 */
export function listTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

/**
 * List tool names only
 *
 * @returns Array of tool names
 */
export function listToolNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * Unregister a tool (for testing purposes)
 *
 * @param name - Tool name
 * @returns true if tool was unregistered, false if not found
 */
export function unregisterTool(name: string): boolean {
  return registry.delete(name);
}

/**
 * Clear all tools (for testing purposes)
 */
export function clearRegistry(): void {
  registry.clear();
}

/**
 * Get registry size
 *
 * @returns Number of registered tools
 */
export function getRegistrySize(): number {
  return registry.size;
}
