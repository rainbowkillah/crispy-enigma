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
import {
  estimateTokensFromMessages,
  estimateTokensFromText,
  runGatewayChat,
  type ChatModelMessage
} from '../../../packages/ai/src/gateway';
import { getTenantDurableObject } from '../../../packages/storage/src/do';

const textEncoder = new TextEncoder();
const tokenUsagePrefix = 'token-usage';
type UsageMetrics = {
  tenantId: string;
  gatewayId: string;
  modelId: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  totalTokens?: number;
  stream: boolean;
  status: 'success' | 'error';
  traceId?: string;
  route?: string;
};

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

type TokenBudget = {
  daily?: number;
  monthly?: number;
};

type TokenUsageSnapshot = {
  dailyKey: string;
  monthlyKey: string;
  dailyUsed: number;
  monthlyUsed: number;
};

function getUsageKeys(tenantId: string, now: number): { dailyKey: string; monthlyKey: string } {
  const date = new Date(now);
  const day = date.toISOString().slice(0, 10);
  const month = date.toISOString().slice(0, 7);
  return {
    dailyKey: `${tenantId}:${tokenUsagePrefix}:daily:${day}`,
    monthlyKey: `${tenantId}:${tokenUsagePrefix}:monthly:${month}`
  };
}

async function readUsageValue(
  kv: KVNamespace | undefined,
  key: string
): Promise<number> {
  if (!kv?.get) {
    return 0;
  }
  const raw = await kv.get(key);
  if (!raw) {
    return 0;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function writeUsageValue(
  kv: KVNamespace | undefined,
  key: string,
  value: number
): Promise<void> {
  if (!kv?.put) {
    return;
  }
  await kv.put(key, String(Math.max(0, Math.floor(value))));
}

async function getUsageSnapshot(
  kv: KVNamespace | undefined,
  tenantId: string,
  now: number
): Promise<TokenUsageSnapshot> {
  const { dailyKey, monthlyKey } = getUsageKeys(tenantId, now);
  const [dailyUsed, monthlyUsed] = await Promise.all([
    readUsageValue(kv, dailyKey),
    readUsageValue(kv, monthlyKey)
  ]);
  return { dailyKey, monthlyKey, dailyUsed, monthlyUsed };
}

async function applyUsageUpdate(
  kv: KVNamespace | undefined,
  snapshot: TokenUsageSnapshot,
  tokens: number
): Promise<void> {
  if (!kv?.put) {
    return;
  }
  const nextDaily = snapshot.dailyUsed + tokens;
  const nextMonthly = snapshot.monthlyUsed + tokens;
  await Promise.all([
    writeUsageValue(kv, snapshot.dailyKey, nextDaily),
    writeUsageValue(kv, snapshot.monthlyKey, nextMonthly)
  ]);
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
  const maxMessageLength = env.MAX_MESSAGE_LENGTH;
  if (maxMessageLength && message.length > maxMessageLength) {
    return fail('invalid_request', 'Message too long', 400, traceId);
  }

  const requestedModelId = parsed.data.modelId;
  const defaultModelId = env.MODEL_ID ?? tenant.aiModels.chat;
  const modelId = requestedModelId ?? defaultModelId;
  let fallbackModelId: string | undefined =
    env.FALLBACK_MODEL_ID ?? tenant.aiModels.chat;

  const allowListEnabled = tenant.featureFlags?.modelAllowList === true;
  if (allowListEnabled) {
    const allowed = new Set(tenant.allowedModels ?? []);
    if (!allowed.has(modelId)) {
      return fail('model_not_allowed', 'Requested model is not allowed', 403, traceId);
    }
    if (fallbackModelId && !allowed.has(fallbackModelId)) {
      fallbackModelId = undefined;
    }
  }

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

  const historyLimit = Math.min(
    tenant.maxMessagesPerSession,
    env.MAX_MESSAGE_COUNT ?? tenant.maxMessagesPerSession
  );
  const historyResponse = await sessionStub.fetch('https://internal/history', {
    method: 'POST',
    body: JSON.stringify({
      limit: historyLimit,
      retentionDays: tenant.sessionRetentionDays,
      maxMessages: tenant.maxMessagesPerSession
    })
  });

  const history = (await historyResponse.json().catch(() => [])) as {
    role: ChatModelMessage['role'];
    content: string;
    timestamp: number;
  }[];
  const chronological = history.slice().reverse().map((item) => ({
    role: item.role,
    content: item.content
  }));

  await sessionStub.fetch('https://internal/append', {
    method: 'POST',
    body: JSON.stringify({
      role: 'user',
      content: message,
      tokenCount: estimateTokensFromText(message),
      retentionDays: tenant.sessionRetentionDays,
      maxMessages: tenant.maxMessagesPerSession
    })
  });

  const messages: ChatModelMessage[] = [
    ...chronological,
    { role: 'user', content: message }
  ];
  const estimatedTokensIn = estimateTokensFromMessages(messages);

  const budget = tenant.tokenBudget as TokenBudget | undefined;
  let usageSnapshot: TokenUsageSnapshot | null = null;
  if (budget && (budget.daily || budget.monthly)) {
    usageSnapshot = await getUsageSnapshot(env.RATE_LIMITER, tenant.tenantId, Date.now());
    if (budget.daily && usageSnapshot.dailyUsed + estimatedTokensIn > budget.daily) {
      return fail('budget_exceeded', 'Daily token budget exceeded', 429, traceId);
    }
    if (budget.monthly && usageSnapshot.monthlyUsed + estimatedTokensIn > budget.monthly) {
      return fail('budget_exceeded', 'Monthly token budget exceeded', 429, traceId);
    }
  }

  let usageMetrics: UsageMetrics | null = null;
  const recordUsage = async (metrics: UsageMetrics) => {
    usageMetrics = metrics;
    if (metrics.status !== 'success') {
      return;
    }
    const totalTokens =
      metrics.totalTokens ??
      (metrics.tokensIn ?? 0) + (metrics.tokensOut ?? 0);
    if (!usageSnapshot) {
      usageSnapshot = await getUsageSnapshot(env.RATE_LIMITER, tenant.tenantId, Date.now());
    }
    await applyUsageUpdate(env.RATE_LIMITER, usageSnapshot, totalTokens);
  };

  if (stream) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    void (async () => {
      let assistantContent = '';
      const safeWrite = async (chunk: Uint8Array) => {
        try {
          await writer.write(chunk);
        } catch {
          // Client likely disconnected; ignore.
        }
      };
      const safeClose = async () => {
        try {
          await writer.close();
        } catch {
          // Ignore close errors (already closed/aborted).
        }
      };

      try {
        const result = await runGatewayChat(
          tenant.tenantId,
          tenant.aiGatewayId,
          modelId,
          messages,
          env,
          {
            stream: true,
            fallbackModelId,
            metadata: {
              traceId,
              sessionId,
              route: '/chat'
            },
            onUsage: recordUsage
          }
        );

        if (result.kind !== 'stream') {
          throw new Error('Expected streaming result');
        }

        const reader = result.stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          assistantContent += value;
          await safeWrite(
            sseEvent({
              sessionId,
              role: 'assistant',
              content: value,
              tenantId: tenant.tenantId,
              traceId
            })
          );
        }

        await sessionStub.fetch('https://internal/append', {
          method: 'POST',
          body: JSON.stringify({
            role: 'assistant',
            content: assistantContent,
            tokenCount:
              (usageMetrics as UsageMetrics | null)?.tokensOut ??
              estimateTokensFromText(assistantContent),
            retentionDays: tenant.sessionRetentionDays,
            maxMessages: tenant.maxMessagesPerSession
          })
        });
      } catch (err) {
        console.error('AI Gateway Error (stream):', {
          tenantId: tenant.tenantId,
          traceId,
          error: err
        });
        await safeWrite(
          sseEvent(
            {
              code: 'ai_error',
              message: 'AI provider unavailable',
              traceId
            },
            'error'
          )
        );
      } finally {
        const usage = usageMetrics as UsageMetrics | null;
        await safeWrite(
          sseEvent(
            {
              done: true,
              usage: usage
                ? {
                    modelId: usage.modelId,
                    tokensIn: usage.tokensIn,
                    tokensOut: usage.tokensOut,
                    totalTokens: usage.totalTokens,
                    latencyMs: usage.latencyMs
                  }
                : undefined
            },
            'done'
          )
        );
        await safeClose();
      }
    })();

    const headers: Record<string, string> = {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'x-tenant-id': tenant.tenantId,
      ...rateLimitHeaders
    };
    if (traceId) {
      headers['x-trace-id'] = traceId;
    }
    headers['x-model-id'] = modelId;
    headers['x-tokens-in'] = String(estimatedTokensIn);
    return new Response(readable, { headers });
  }

  let assistantContent: string;
  let resolvedModelId: string | undefined;
  try {
    const result = await runGatewayChat(
      tenant.tenantId,
      tenant.aiGatewayId,
      modelId,
      messages,
      env,
      {
        stream: false,
        fallbackModelId,
        metadata: {
          traceId,
          sessionId,
          route: '/chat'
        },
        onUsage: recordUsage
      }
    );
    if (result.kind !== 'text') {
      throw new Error('Expected text result');
    }
    assistantContent = result.content;
    resolvedModelId = result.modelId;
  } catch (err) {
    console.error('AI Gateway Error (non-stream):', {
      tenantId: tenant.tenantId,
      traceId,
      error: err
    });
    return fail('ai_error', 'AI provider unavailable', 502, traceId);
  }

  const usage = usageMetrics as UsageMetrics | null;
  await sessionStub.fetch('https://internal/append', {
    method: 'POST',
    body: JSON.stringify({
      role: 'assistant',
      content: assistantContent,
      tokenCount:
        usage?.tokensOut ?? estimateTokensFromText(assistantContent),
      retentionDays: tenant.sessionRetentionDays,
      maxMessages: tenant.maxMessagesPerSession
    })
  });

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
  if (resolvedModelId) {
    response.headers.set('x-model-id', resolvedModelId);
  }
  if (usage) {
    if (usage.tokensIn !== undefined) {
      response.headers.set('x-tokens-in', String(usage.tokensIn));
    }
    if (usage.tokensOut !== undefined) {
      response.headers.set('x-tokens-out', String(usage.tokensOut));
    }
    if (usage.totalTokens !== undefined) {
      response.headers.set('x-tokens-total', String(usage.totalTokens));
    }
    response.headers.set('x-ai-latency-ms', String(usage.latencyMs));
  }
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
