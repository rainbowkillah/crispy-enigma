import type { ToolContext, ToolResult } from './schema.js';
import { validateToolParameters } from './schema.js';
import { getTool } from './registry.js';
import { ToolErrorCode, ToolExecutionError } from './errors.js';
import { checkToolPermission } from './permissions.js';

export type DispatchOptions = {
  timeoutMs?: number;
};

export type DispatchResult = {
  toolName: string;
  result: ToolResult;
  durationMs: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 60_000;

function createTimeoutPromise(ms: number): { promise: Promise<never>; clear: () => void } {
  let timerId: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new ToolExecutionError(
        ToolErrorCode.EXECUTION_TIMEOUT,
        `Tool execution timed out after ${ms}ms`
      ));
    }, ms);
  });
  return {
    promise,
    clear: () => clearTimeout(timerId),
  };
}

export async function dispatchTool(
  toolName: string,
  params: unknown,
  context: ToolContext,
  options?: DispatchOptions
): Promise<DispatchResult> {
  const startedAt = Date.now();

  const tool = getTool(toolName);
  if (!tool) {
    throw new ToolExecutionError(
      ToolErrorCode.TOOL_NOT_FOUND,
      `Tool '${toolName}' not found`
    );
  }

  const validation = validateToolParameters(params, tool.parameters);
  if (!validation.valid) {
    throw new ToolExecutionError(
      ToolErrorCode.VALIDATION_FAILED,
      `Parameter validation failed: ${validation.errors.join('; ')}`,
      validation.errors
    );
  }

  const permissionResult = checkToolPermission(
    toolName,
    tool.permissions,
    context.featureFlags
  );
  if (!permissionResult.allowed) {
    throw new ToolExecutionError(
      ToolErrorCode.PERMISSION_DENIED,
      permissionResult.reason ?? 'Permission denied'
    );
  }

  const callTimeout = options?.timeoutMs
    ? Math.min(Math.max(options.timeoutMs, 1000), MAX_TIMEOUT_MS)
    : undefined;
  const toolTimeout = tool.timeout ?? DEFAULT_TIMEOUT_MS;
  const effectiveTimeout = callTimeout ?? toolTimeout;

  const timeout = createTimeoutPromise(effectiveTimeout);

  try {
    const result = await Promise.race([
      tool.handler(params, context),
      timeout.promise,
    ]);
    const durationMs = Date.now() - startedAt;
    return {
      toolName,
      result: {
        ...result,
        metadata: {
          ...result.metadata,
          durationMs,
        },
      },
      durationMs,
    };
  } catch (error) {
    if (error instanceof ToolExecutionError) {
      throw error;
    }
    throw new ToolExecutionError(
      ToolErrorCode.EXECUTION_ERROR,
      error instanceof Error ? error.message : 'Tool execution failed',
      error instanceof Error ? { stack: error.stack } : undefined
    );
  } finally {
    timeout.clear();
  }
}
