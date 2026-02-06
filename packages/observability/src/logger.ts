import type { Request as CfRequest } from '@cloudflare/workers-types';

/**
 * Defines the structured format for a single log entry, aligning with `docs/metrics.md`.
 */
export interface LogEntry {
	timestamp: string;
	level: 'info' | 'warn' | 'error';
	message: string;
	tenantId?: string;
	requestId?: string;
	route?: string;
	latencyMs?: number;
	status?: number;
	source?: string;
	cf?: Record<string, any>;
	durableObjectClass?: string;
	durableObjectId?: string;
	// Allow for arbitrary extra data
	[key: string]: any;
}

/**
 * Defines the context that can be attached to a Logger instance.
 */
export interface LoggerContext {
	tenantId?: string;
	requestId?: string;
	route?: string;
	source?: string;
	cf?: Record<string, any>;
	durableObjectClass?: string;
	durableObjectId?: string;
}

/**
 * A structured JSON logger for Cloudflare Workers.
 *
 * Each log method outputs a single JSON string to `console.log`, which is
 * the standard way to capture logs in the Workers environment.
 */
export class Logger {
	private context: LoggerContext;

	constructor(context: LoggerContext = {}) {
		this.context = context;
	}

	private log(level: 'info' | 'warn' | 'error', message: string, extra: Record<string, any> = {}) {
		const entry: LogEntry = {
			...this.context,
			...extra,
			timestamp: new Date().toISOString(),
			level,
			message,
		};

		// In Cloudflare Workers, console.log is the standard mechanism for logging.
		// By serializing our entry to a JSON string, we create a structured log.
		console.log(JSON.stringify(entry));
	}

	info(message: string, extra?: Record<string, any>) {
		this.log('info', message, extra);
	}

	warn(message: string, extra?: Record<string, any>) {
		this.log('warn', message, extra);
	}

	/**
	 * Logs an error-level message. If an Error object is provided in the `extra`
	 * properties, it will be serialized into a structured format.
	 */
	error(message: string, extra: Record<string, any> & { error?: Error } = {}) {
		const { error, ...rest } = extra;
		const errorInfo: Record<string, any> = {};
		if (error) {
			errorInfo.error = {
				name: error.name,
				message: error.message,
				stack: error.stack?.split('\n'),
			};
		}
		this.log('error', message, { ...errorInfo, ...rest });
	}

	/**
	 * Creates a new "child" logger instance with additional context merged in.
	 * @param extraContext The additional context to add.
	 * @returns A new Logger instance.
	 */
	withContext(extraContext: Partial<LoggerContext>): Logger {
		return new Logger({ ...this.context, ...extraContext });
	}
}

/**
 * Factory function to create a logger pre-populated with context from an incoming request.
 * It automatically extracts the `cf-ray`, `x-request-id`, and `cf` properties.
 */
export function createLogger(request: CfRequest, context: Partial<LoggerContext> = {}): Logger {
	const ray = request.headers.get('cf-ray');
	const requestId = request.headers.get('x-request-id') || ray || crypto.randomUUID();

	const baseContext: LoggerContext = { requestId, cf: request.cf ? JSON.parse(JSON.stringify(request.cf)) : undefined, ...context };

	return new Logger(baseContext);
}