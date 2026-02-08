export enum ToolErrorCode {
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  EXECUTION_ERROR = 'EXECUTION_ERROR',
}

export class ToolExecutionError extends Error {
  readonly code: ToolErrorCode;
  readonly details?: unknown;

  constructor(code: ToolErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ToolExecutionError';
    this.code = code;
    this.details = details;
  }
}
