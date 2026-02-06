import { tenantConfigs } from '../../../tenants/index';
import {
  buildTenantIndex,
  chatRequestSchema,
  fail,
  getTraceId,
  loadTenantConfig,
  ok,
  type Env,
  type TenantConfig
} from '../../../packages/core/src';
import { resolveTenant } from '../../../packages/core/src/tenant/resolveTenant';
import { getTenantDurableObject } from '../../../packages/storage/src/do';

const textEncoder = new TextEncoder();

const configs = tenantConfigs.map((config) => loadTenantConfig(config));
const tenantIndex = buildTenantIndex(configs);

function sseEvent(data: unknown, event?: string): Uint8Array {
  const payload = JSON.stringify(data);
  if (event) {
    return textEncoder.encode(`event: ${event}\ndata: ${payload}\n\n`);
  }
  return textEncoder.encode(`data: ${payload}\n\n`);
}

function getChatRoute(pathname: string): {
  kind: 'root' | 'history' | 'clear' | 'unknown';
  sessionId?: string;
} {
  if (pathname === '/chat') {
    return { kind: 'root' };
  }
  if (!pathname.startsWith('/chat/')) {
    return { kind: 'unknown' };
  }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return { kind: 'unknown' };
  }
  const sessionId = segments[1];
  if (segments.length === 3 && segments[2] === 'history') {
    return { kind: 'history', sessionId };
  }
  if (segments.length === 2) {
    return { kind: 'clear', sessionId };
  }
  return { kind: 'unknown' };
}

function assertSessionId(sessionId: string | undefined, traceId?: string): Response | null {
  if (!sessionId) {
    return fail('invalid_request', 'Missing sessionId', 400, traceId);
  }
  const parsed = chatRequestSchema.shape.sessionId.safeParse(sessionId);
  if (!parsed.success) {
    return fail('invalid_request', 'Invalid sessionId', 400, traceId);
  }
  return null;
}

async function handleChatRequest(
  request: Request,
  env: Env,
  tenant: TenantConfig,
  traceId?: string
): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail('invalid_json', 'Invalid JSON', 400, traceId);
  }

  const parsed = chatRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return fail('invalid_request', 'Invalid request', 400, traceId);
  }

  const { sessionId, message, stream, userId } = parsed.data;
  const sessionStub = getTenantDurableObject(
    env.CHAT_SESSION,
    tenant.tenantId,
    sessionId
  );
  const limiterKey = userId ?? request.headers.get('x-user-id') ?? 'anonymous';
  const limiterStub = getTenantDurableObject(
    env.RATE_LIMITER_DO,
    tenant.tenantId,
    `ratelimit:${limiterKey}`
  );

  const limitResponse = await limiterStub.fetch('https://internal/check', {
    method: 'POST',
    body: JSON.stringify({ limit: tenant.rateLimit.perMinute, windowSec: 60 })
  });
  const rateLimit = (await limitResponse.json()) as {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  };

  const rateLimitHeaders: Record<string, string> = {
    'x-ratelimit-limit': String(tenant.rateLimit.perMinute),
    'x-ratelimit-remaining': String(rateLimit.remaining),
    'x-ratelimit-reset': String(rateLimit.resetAt)
  };

  if (!rateLimit.allowed) {
    const response = fail('rate_limited', 'Rate limit exceeded', 429, traceId);
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  await sessionStub.fetch('https://internal/append', {
    method: 'POST',
    body: JSON.stringify({
      role: 'user',
      content: message,
      retentionDays: tenant.sessionRetentionDays,
      maxMessages: tenant.maxMessagesPerSession
    })
  });

  const assistantContent = 'Mock response. Streaming contract implemented in #16.';

  await sessionStub.fetch('https://internal/append', {
    method: 'POST',
    body: JSON.stringify({
      role: 'assistant',
      content: assistantContent,
      retentionDays: tenant.sessionRetentionDays,
      maxMessages: tenant.maxMessagesPerSession
    })
  });

  if (stream) {
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          sseEvent({
            sessionId,
            role: 'assistant',
            content: assistantContent,
            tenantId: tenant.tenantId,
            traceId
          })
        );
        controller.enqueue(sseEvent({ done: true }, 'done'));
        controller.close();
      }
    });

    const headers: Record<string, string> = {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-tenant-id': tenant.tenantId,
      ...rateLimitHeaders
    };
    if (traceId) {
      headers['x-trace-id'] = traceId;
    }
    return new Response(streamBody, { headers });
  }

  const response = ok(
    {
      status: 'accepted',
      sessionId,
      stream,
      message: assistantContent
    },
    traceId
  );
  Object.entries(rateLimitHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export { ChatSession } from './session-do';
export { RateLimiter } from './rate-limiter-do';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const traceId = getTraceId(request);
    const tenant = resolveTenant(request, {
      hostMap: tenantIndex.hostMap,
      apiKeyMap: tenantIndex.apiKeyMap
    });

    if (!tenant) {
      return fail('tenant_required', 'Tenant required', 400, traceId);
    }

    const config = tenantIndex.byId[tenant.tenantId];
    if (!config) {
      return fail('tenant_unknown', 'Unknown tenant', 404, traceId);
    }

    const url = new URL(request.url);

    const maxBodySize = env.MAX_REQUEST_BODY_SIZE ?? 10240;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const contentLength = request.headers.get('content-length');
      if (contentLength && Number(contentLength) > maxBodySize) {
        return fail('payload_too_large', 'Request body too large', 413, traceId);
      }

      if (!contentLength) {
        const body = await request.clone().arrayBuffer();
        if (body.byteLength > maxBodySize) {
          return fail('payload_too_large', 'Request body too large', 413, traceId);
        }
      }
    }
    if (url.pathname === '/health') {
      const modelId = env.MODEL_ID ?? config.aiModels.chat;
      const fallbackModelId = env.FALLBACK_MODEL_ID ?? config.aiModels.chat;
      return ok(
        {
          status: 'ok',
          tenantId: config.tenantId,
          environment: env.ENVIRONMENT ?? 'unknown',
          modelId,
          fallbackModelId
        },
        traceId
      );
    }

    const chatRoute = getChatRoute(url.pathname);
    if (chatRoute.kind === 'root') {
      if (request.method !== 'POST') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }

      return handleChatRequest(request, env, config, traceId);
    }

    if (chatRoute.kind === 'history' && chatRoute.sessionId) {
      if (request.method !== 'GET') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }
      const validation = assertSessionId(chatRoute.sessionId, traceId);
      if (validation) {
        return validation;
      }
      const sessionStub = getTenantDurableObject(
        env.CHAT_SESSION,
        config.tenantId,
        chatRoute.sessionId
      );
      const historyResponse = await sessionStub.fetch(
        'https://internal/history',
        {
          method: 'POST',
          body: JSON.stringify({
            retentionDays: config.sessionRetentionDays,
            maxMessages: config.maxMessagesPerSession
          })
        }
      );
      return new Response(await historyResponse.text(), {
        status: historyResponse.status,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (chatRoute.kind === 'clear' && chatRoute.sessionId) {
      if (request.method !== 'DELETE') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }
      const validation = assertSessionId(chatRoute.sessionId, traceId);
      if (validation) {
        return validation;
      }
      const sessionStub = getTenantDurableObject(
        env.CHAT_SESSION,
        config.tenantId,
        chatRoute.sessionId
      );
      const clearResponse = await sessionStub.fetch('https://internal/clear', {
        method: 'DELETE'
      });
      return new Response(await clearResponse.text(), {
        status: clearResponse.status,
        headers: { 'content-type': 'application/json' }
      });
    }

    return fail('not_found', 'Not found', 404, traceId);
  }
};
