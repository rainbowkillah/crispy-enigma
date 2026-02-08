export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  tenantId: string;
  traceId: string;
  timestamp: string;
  level: LogLevel;
  event: string;
  route?: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
  message?: string;
}

export interface LoggerContext {
  tenantId: string;
  traceId: string;
  route?: string;
}

export class Logger {
  private context: LoggerContext;

  constructor(context: LoggerContext) {
    this.context = context;
  }

  private log(level: LogLevel, event: string, meta?: Record<string, unknown>, durationMs?: number, message?: string) {
    const entry: LogEntry = {
      tenantId: this.context.tenantId,
      traceId: this.context.traceId,
      timestamp: new Date().toISOString(),
      level,
      event,
      route: this.context.route,
      durationMs,
      meta,
      message,
    };
    console.log(JSON.stringify(entry));
  }

  debug(event: string, meta?: Record<string, unknown>, durationMs?: number) {
    this.log('debug', event, meta, durationMs);
  }

  info(event: string, meta?: Record<string, unknown>, durationMs?: number) {
    this.log('info', event, meta, durationMs);
  }

  warn(event: string, meta?: Record<string, unknown>, durationMs?: number) {
    this.log('warn', event, meta, durationMs);
  }

  error(event: string, error?: unknown, meta?: Record<string, unknown>, durationMs?: number) {
    const errorMeta = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause
    } : { error: String(error) };

    this.log('error', event, { ...meta, ...errorMeta }, durationMs);
  }
  
  withContext(additionalContext: Partial<LoggerContext>): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }
}

export function createLogger(context: LoggerContext): Logger {
  return new Logger(context);
}