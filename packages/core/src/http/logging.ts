import { createLogger, Logger } from '@crispy-enigma/observability/logger';
import type { Request as CfRequest } from '@cloudflare/workers-types';

/**
 * A common pattern is to augment the request object to pass context
 * between middleware. This interface represents the augmented request,
 * making the logger instance available to all downstream handlers.
 */
export interface RequestWithLogger extends CfRequest {
	logger: Logger;
}

/**
 * A generic `next` function signature for middleware chaining.
 * It receives the (potentially augmented) request and returns a `Response`.
 */
export type Next = (request: RequestWithLogger) => Promise<Response>;

/**
 * A logging middleware that wraps the request/response lifecycle. It's designed
 * to be the outermost layer in the request handling chain.
 *
 * This middleware:
 * 1. Creates a request-scoped logger instance with a correlation ID.
 * 2. Augments the request object with the logger, making it available downstream.
 * 3. Times the request processing from start to finish.
 * 4. Logs the final outcome (success or error) with key details like status and latency.
 *
 * @example
 * // In your Worker's fetch handler:
 * export default {
 *   async fetch(request, env, ctx) {
 *     return loggingMiddleware(request, async (reqWithLogger) => {
 *       // Now, `reqWithLogger.logger` is available in all subsequent handlers.
 *       return myRouter.handle(reqWithLogger, env, ctx);
 *     });
 *   }
 * }
 */
export async function loggingMiddleware(request: CfRequest, next: Next): Promise<Response> {
	const startTime = Date.now();
	const logger = createLogger(request, { source: 'api-request' });

	const requestWithLogger = request as RequestWithLogger;
	requestWithLogger.logger = logger;

	try {
		const response = await next(requestWithLogger);
		const latencyMs = Date.now() - startTime;

		logger.info('Request processed', {
			latencyMs,
			status: response.status,
			route: new URL(request.url).pathname,
			method: request.method,
		});

		return response;
	} catch (err) {
		const latencyMs = Date.now() - startTime;
		const error = err instanceof Error ? err : new Error(String(err) || 'Unknown error');
		const status = (err as any).status || 500;

		logger.error('Request failed', {
			latencyMs,
			status,
			route: new URL(request.url).pathname,
			method: request.method,
			error,
		});

		// If a handler throws a Response, we should return it as-is.
		if (err instanceof Response) {
			return err;
		}

		// Otherwise, re-throw to be caught by a final error handler.
		throw error;
	}
}