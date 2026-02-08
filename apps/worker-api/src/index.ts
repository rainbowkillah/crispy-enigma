import { tenantConfigs } from '../../../tenants/index';
import {
  buildTenantIndex,
  chatRequestSchema,
  ingestRequestSchema,
  fail,
  getTraceId,
  loadTenantConfig,
  ok,
  searchRequestSchema,
  type SearchResponse,
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
import {
  assembleRagPrompt,
  chunkText,
  runGatewayEmbeddings,
  upsertTenantVectors,
  detectQueryIntent
} from '../../../packages/rag/src';
import { getTenantDurableObject } from '../../../packages/storage/src/do';
import { TenantVectorizeAdapter } from '../../../packages/storage/src/vectorize';
import {
  getCachedSearch,
  hashSearchQuery,
  setCachedSearch
} from '../../../packages/storage/src/search-cache';
import { getSearchCacheMetrics } from '../../../packages/observability/src/metrics';
import { bootstrapTools } from '../../../packages/tools/src/bootstrap';
import { dispatchTool } from '../../../packages/tools/src/dispatcher';
import { listTools } from '../../../packages/tools/src/registry';
import { ToolExecutionError } from '../../../packages/tools/src/errors';
import { recordToolAudit, hashToolParams } from '../../../packages/tools/src/audit';
import { recordToolMetrics, getToolMetrics } from '../../../packages/tools/src/metrics';
import type { ToolContext } from '../../../packages/tools/src/schema';

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

type SearchMetrics = {
  tenantId: string;
  traceId?: string;
  route: 'search';
  status: 'success' | 'error' | 'cache-hit';
  cacheHit: boolean;
  latencies: {
    totalMs: number;
    rewriteMs?: number;
    embeddingMs?: number;
    retrievalMs?: number;
    ragAssemblyMs?: number;
    generationMs?: number;
    followUpGenerationMs?: number;
  };
  tokensUsed?: {
    rewrite?: { in: number; out: number };
    followUpGeneration?: { in: number; out: number };
  };
  topK: number;
  matchesReturned: number;
};

type CacheCheckEvent = {
  timestamp: number;
  hit: boolean;
  latencyMs: number;
  queryHash: string;
};

const configs = tenantConfigs.map((config) => loadTenantConfig(config));
const tenantIndex = buildTenantIndex(configs);

bootstrapTools();

function buildToolContext(
  tenant: TenantConfig,
  env: Env,
  requestId: string,
  userId?: string
): ToolContext {
  return {
    tenantId: tenant.tenantId,
    requestId,
    userId,
    env,
    featureFlags: tenant.featureFlags as Record<string, boolean> | undefined,
    aiGatewayId: tenant.aiGatewayId,
    chatModelId: env.MODEL_ID ?? tenant.aiModels.chat,
    embeddingModelId: env.EMBEDDING_MODEL_ID ?? tenant.aiModels.embeddings,
  };
}

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

function getRagRoute(pathname: string): 'ingest' | 'search' | 'unknown' {
  if (pathname === '/ingest') {
    return 'ingest';
  }
  if (pathname === '/search') {
    return 'search';
  }
  return 'unknown';
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

function buildRagMessages(prompt: string): ChatModelMessage[] {
  const lines = prompt.split('\n');
  const systemLine = lines[0] ?? '';
  const instructionLine = lines[1] ?? '';
  const systemPrefix = 'System:';
  const instructionPrefix = 'Instruction:';
  const system =
    systemLine.startsWith(systemPrefix)
      ? systemLine.slice(systemPrefix.length).trim()
      : '';
  const instruction =
    instructionLine.startsWith(instructionPrefix)
      ? instructionLine.slice(instructionPrefix.length).trim()
      : '';
  const systemContent = [system, instruction].filter(Boolean).join('\n');
  const userContent = lines.slice(2).join('\n').trim();
  const messages: ChatModelMessage[] = [];
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }
  messages.push({
    role: 'user',
    content: userContent || prompt
  });
  return messages;
}

function computeConfidence(scores: Array<number | undefined>, limit = 3): number {
  const filtered = scores.filter((score) => typeof score === 'number') as number[];
  if (filtered.length === 0) {
    return 0;
  }
  const topScores = filtered.slice(0, limit);
  const average = topScores.reduce((sum, score) => sum + score, 0) / topScores.length;
  return Math.max(0, Math.min(1, average));
}

function extractJsonArray(text: string): string[] {
  const trimmed = text.trim();
  const candidate =
    trimmed.startsWith('[') && trimmed.endsWith(']')
      ? trimmed
      : trimmed.match(/\[[\s\S]*\]/)?.[0];
  if (!candidate) {
    return [];
  }
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

async function recordSearchMetrics(
  env: Env,
  tenantId: string,
  metrics: SearchMetrics
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const key = `${tenantId}:search:metrics:${Date.now()}`;
  try {
    await env.CACHE.put(key, JSON.stringify(metrics), {
      expirationTtl: 604800
    });
  } catch (error) {
    if (env.DEBUG_LOGGING) {
      console.warn('Failed to write search metrics', { tenantId, error });
    }
  }
}

async function recordCacheCheck(
  env: Env,
  tenantId: string,
  event: CacheCheckEvent
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : String(Math.random()).slice(2);
  const key = `${tenantId}:search:cache-check:${event.timestamp}:${suffix}`;
  try {
    await env.CACHE.put(key, JSON.stringify(event), {
      expirationTtl: 86400
    });
  } catch (error) {
    if (env.DEBUG_LOGGING) {
      console.warn('Failed to write cache check', { tenantId, error });
    }
  }
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

  const { sessionId, message, stream, userId, tool_name, tool_params } = parsed.data;
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

  let toolResultContext = '';
  if (tool_name) {
    const toolCtx = buildToolContext(
      tenant,
      env,
      traceId ?? crypto.randomUUID(),
      userId
    );
    try {
      const toolDispatch = await dispatchTool(
        tool_name,
        tool_params ?? {},
        toolCtx
      );
      toolResultContext = `[Tool ${tool_name} result]: ${JSON.stringify(toolDispatch.result.data)}`;
      const paramsHash = await hashToolParams(tool_params ?? {});
      void recordToolAudit(
        {
          tenantId: tenant.tenantId,
          toolName: tool_name,
          requestId: traceId ?? '',
          userId,
          paramsHash,
          success: true,
          durationMs: toolDispatch.durationMs,
          timestamp: Date.now(),
        },
        env
      );
      void recordToolMetrics(
        {
          tenantId: tenant.tenantId,
          toolName: tool_name,
          durationMs: toolDispatch.durationMs,
          success: true,
          tokensUsed: toolDispatch.result.metadata?.tokensUsed,
          timestamp: Date.now(),
        },
        env
      );
    } catch (err) {
      const errorCode =
        err instanceof ToolExecutionError ? err.code : 'EXECUTION_ERROR';
      const errorMessage =
        err instanceof Error ? err.message : 'Tool execution failed';
      void recordToolAudit(
        {
          tenantId: tenant.tenantId,
          toolName: tool_name,
          requestId: traceId ?? '',
          userId,
          paramsHash: '',
          success: false,
          durationMs: 0,
          errorCode,
          timestamp: Date.now(),
        },
        env
      );
      void recordToolMetrics(
        {
          tenantId: tenant.tenantId,
          toolName: tool_name,
          durationMs: 0,
          success: false,
          timestamp: Date.now(),
        },
        env
      );
      return fail('tool_error', errorMessage, 400, traceId);
    }
  }

  const toolSystemMessage: ChatModelMessage[] = toolResultContext
    ? [{ role: 'system' as const, content: toolResultContext }]
    : [];

  const messages: ChatModelMessage[] = [
    ...toolSystemMessage,
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
export type { SearchMetrics };

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

    if (url.pathname === '/metrics/search-cache') {
      if (request.method !== 'GET') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }
      const periodParam = url.searchParams.get('period') ?? '24h';
      const allowedPeriods = new Set(['1h', '24h', '7d']);
      if (!allowedPeriods.has(periodParam)) {
        return fail('invalid_request', 'Invalid period', 400, traceId);
      }
      const metrics = await getSearchCacheMetrics(
        config.tenantId,
        periodParam as '1h' | '24h' | '7d',
        env
      );
      return ok(metrics, traceId);
    }

    if (url.pathname === '/tools/execute') {
      if (request.method !== 'POST') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return fail('invalid_json', 'Invalid JSON', 400, traceId);
      }

      const body = payload as Record<string, unknown>;
      const toolName = body.tool_name;
      const toolParams = body.params;
      if (typeof toolName !== 'string' || !toolName) {
        return fail('invalid_request', 'Missing tool_name', 400, traceId);
      }

      const toolCtx = buildToolContext(
        config,
        env,
        traceId ?? crypto.randomUUID(),
        typeof body.user_id === 'string' ? body.user_id : undefined
      );

      try {
        const result = await dispatchTool(toolName, toolParams ?? {}, toolCtx);
        const paramsHash = await hashToolParams(toolParams ?? {});
        void recordToolAudit(
          {
            tenantId: config.tenantId,
            toolName,
            requestId: traceId ?? '',
            userId: toolCtx.userId,
            paramsHash,
            success: true,
            durationMs: result.durationMs,
            timestamp: Date.now(),
          },
          env
        );
        void recordToolMetrics(
          {
            tenantId: config.tenantId,
            toolName,
            durationMs: result.durationMs,
            success: true,
            tokensUsed: result.result.metadata?.tokensUsed,
            timestamp: Date.now(),
          },
          env
        );
        return ok(result.result, traceId);
      } catch (err) {
        const errorCode =
          err instanceof ToolExecutionError ? err.code : 'EXECUTION_ERROR';
        const errorMessage =
          err instanceof Error ? err.message : 'Tool execution failed';
        const status =
          err instanceof ToolExecutionError
            ? errorCode === 'TOOL_NOT_FOUND'
              ? 404
              : errorCode === 'PERMISSION_DENIED'
                ? 403
                : errorCode === 'VALIDATION_FAILED'
                  ? 400
                  : 500
            : 500;
        void recordToolAudit(
          {
            tenantId: config.tenantId,
            toolName,
            requestId: traceId ?? '',
            paramsHash: '',
            success: false,
            durationMs: 0,
            errorCode,
            timestamp: Date.now(),
          },
          env
        );
        void recordToolMetrics(
          {
            tenantId: config.tenantId,
            toolName,
            durationMs: 0,
            success: false,
            timestamp: Date.now(),
          },
          env
        );
        return fail(errorCode, errorMessage, status, traceId);
      }
    }

    if (url.pathname === '/schema/tools') {
      if (request.method !== 'GET') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }
      const tools = listTools().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        output: t.output,
        timeout: t.timeout,
        permissions: t.permissions,
      }));
      return ok({ tools }, traceId);
    }

    if (url.pathname === '/metrics/tools/execution') {
      if (request.method !== 'GET') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }
      const periodParam = url.searchParams.get('period') ?? '24h';
      const allowedPeriods = new Set(['1h', '24h', '7d']);
      if (!allowedPeriods.has(periodParam)) {
        return fail('invalid_request', 'Invalid period', 400, traceId);
      }
      const metrics = await getToolMetrics(
        config.tenantId,
        periodParam as '1h' | '24h' | '7d',
        env
      );
      return ok(metrics, traceId);
    }

    const ragRoute = getRagRoute(url.pathname);
    if (ragRoute === 'ingest') {
      if (request.method !== 'POST') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return fail('invalid_json', 'Invalid JSON', 400, traceId);
      }

      const parsed = ingestRequestSchema.safeParse(payload);
      if (!parsed.success) {
        return fail('invalid_request', 'Invalid request', 400, traceId);
      }

      const { docId, text, source, title, url: sourceUrl, chunking } = parsed.data;
      const chunks = chunkText(text, {
        maxChunkSize: chunking?.maxChunkSize,
        overlap: chunking?.overlap
      });

      if (chunks.length === 0) {
        return fail('invalid_request', 'No content to ingest', 400, traceId);
      }

      const embeddingModelId = env.EMBEDDING_MODEL_ID ?? config.aiModels.embeddings;
      let embeddingsResult;
      try {
        embeddingsResult = await runGatewayEmbeddings(
          config.tenantId,
          config.aiGatewayId,
          embeddingModelId,
          chunks.map((chunk) => chunk.text),
          env,
          {
            metadata: {
              traceId,
              route: '/ingest'
            }
          }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Embedding provider unavailable';
        console.error('Embedding error:', {
          tenantId: config.tenantId,
          gatewayId: config.aiGatewayId,
          modelId: embeddingModelId,
          error: errorMessage,
          traceId
        });
        return fail('ai_error', `Embedding error: ${errorMessage}`, 502, traceId);
      }

      const snippetLength = 512;
      const records = chunks.map((chunk, index) => ({
        id: `${docId}:${chunk.index}`,
        values: embeddingsResult.embeddings[index] ?? [],
        metadata: {
          tenantId: config.tenantId,
          docId,
          chunkId: String(chunk.index),
          source,
          title,
          url: sourceUrl,
          text: chunk.text.slice(0, snippetLength)
        }
      }));

      await upsertTenantVectors(config.tenantId, env.VECTORIZE, records);

      return ok(
        {
          status: 'ingested',
          docId,
          chunks: chunks.length,
          embeddingModelId: embeddingsResult.modelId
        },
        traceId
      );
    }

    if (ragRoute === 'search') {
      if (request.method !== 'POST') {
        return fail('method_not_allowed', 'Method not allowed', 405, traceId);
      }
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return fail('invalid_json', 'Invalid JSON', 400, traceId);
      }

      const parsed = searchRequestSchema.safeParse(payload);
      if (!parsed.success) {
        return fail('invalid_request', 'Invalid request', 400, traceId);
      }

      const searchStartedAt = performance.now();
      const originalQuery = parsed.data.query;
      const requestedTopK = parsed.data.topK ?? 5;

      let rewriteMs: number | undefined;
      let rewrittenQuery = originalQuery;
      try {
        const rewriteEnv = env.MODEL_ID
          ? env
          : { ...env, MODEL_ID: config.aiModels.chat };
        const rewriteStart = performance.now();
        const rewriteResult = await detectQueryIntent(
          config.tenantId,
          config.aiGatewayId,
          originalQuery,
          rewriteEnv
        );
        rewrittenQuery = rewriteResult.rewritten || originalQuery;
        rewriteMs = performance.now() - rewriteStart;
      } catch {
        rewrittenQuery = originalQuery;
      }

      const cacheStart = performance.now();
      const cached = await getCachedSearch(config.tenantId, rewrittenQuery, env);
      if (cached) {
        const cacheLatency = performance.now() - cacheStart;
        try {
          const queryHash = await hashSearchQuery(rewrittenQuery);
          void recordCacheCheck(env, config.tenantId, {
            timestamp: Date.now(),
            hit: true,
            latencyMs: cacheLatency,
            queryHash
          });
        } catch {
          // Ignore cache check hashing failures.
        }
        void recordSearchMetrics(env, config.tenantId, {
          tenantId: config.tenantId,
          traceId,
          route: 'search',
          status: 'cache-hit',
          cacheHit: true,
          latencies: {
            totalMs: performance.now() - searchStartedAt,
            rewriteMs
          },
          topK: requestedTopK,
          matchesReturned: cached.sources.length
        });
        return ok(cached, traceId);
      }

      const embeddingModelId = env.EMBEDDING_MODEL_ID ?? config.aiModels.embeddings;
      let embeddingResult;
      let embeddingMs: number | undefined;
      try {
        const embeddingStart = performance.now();
        embeddingResult = await runGatewayEmbeddings(
          config.tenantId,
          config.aiGatewayId,
          embeddingModelId,
          [rewrittenQuery],
          env,
          {
            metadata: {
              traceId,
              route: '/search',
              query: 'vectorize'
            }
          }
        );
        embeddingMs = performance.now() - embeddingStart;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Embedding provider unavailable';
        console.error('Search embedding error:', {
          tenantId: config.tenantId,
          gatewayId: config.aiGatewayId,
          modelId: embeddingModelId,
          error: errorMessage,
          traceId
        });
        void recordSearchMetrics(env, config.tenantId, {
          tenantId: config.tenantId,
          traceId,
          route: 'search',
          status: 'error',
          cacheHit: false,
          latencies: {
            totalMs: performance.now() - searchStartedAt,
            rewriteMs,
            embeddingMs
          },
          topK: requestedTopK,
          matchesReturned: 0
        });
        return fail('ai_error', `Embedding error: ${errorMessage}`, 502, traceId);
      }

      const vector = embeddingResult.embeddings[0] ?? [];
      let retrievalMs: number | undefined;
      let rawMatches: VectorizeMatches = { matches: [], count: 0 } as VectorizeMatches;
      if (vector.length > 0) {
        try {
          const retrievalStart = performance.now();
          const adapter = new TenantVectorizeAdapter(env.VECTORIZE);
          rawMatches = await adapter.query(config.tenantId, vector, {
            topK: requestedTopK,
            filter: parsed.data.filter
          });
          retrievalMs = performance.now() - retrievalStart;
        } catch {
          void recordSearchMetrics(env, config.tenantId, {
            tenantId: config.tenantId,
            traceId,
            route: 'search',
            status: 'error',
            cacheHit: false,
            latencies: {
              totalMs: performance.now() - searchStartedAt,
              rewriteMs,
              embeddingMs,
              retrievalMs
            },
            topK: requestedTopK,
            matchesReturned: 0
          });
          return fail('ai_error', 'Retrieval provider unavailable', 502, traceId);
        }
      }

      const matches = rawMatches.matches ?? [];
      const chunks = matches.map((match) => {
        const metadata = (match.metadata ?? {}) as Record<string, unknown>;
        return {
          id: match.id,
          text: String(metadata.text ?? ''),
          metadata: {
            tenantId: String(metadata.tenantId ?? config.tenantId),
            docId: String(metadata.docId ?? ''),
            chunkId: String(metadata.chunkId ?? ''),
            source: metadata.source ? String(metadata.source) : undefined,
            title: metadata.title ? String(metadata.title) : undefined,
            url: metadata.url ? String(metadata.url) : undefined
          },
          score: match.score
        };
      });

      const ragStart = performance.now();
      const rag = assembleRagPrompt(originalQuery, chunks);
      const ragAssemblyMs = performance.now() - ragStart;

      if (rag.safety && !rag.safety.allowed) {
        const response: SearchResponse = {
          status: 'ok',
          traceId,
          answer: "I'm sorry, I can't help with that.",
          sources: [],
          confidence: 0,
          followUps: []
        };
        void recordSearchMetrics(env, config.tenantId, {
          tenantId: config.tenantId,
          traceId,
          route: 'search',
          status: 'success',
          cacheHit: false,
          latencies: {
            totalMs: performance.now() - searchStartedAt,
            rewriteMs,
            embeddingMs,
            retrievalMs,
            ragAssemblyMs
          },
          topK: requestedTopK,
          matchesReturned: 0
        });
        return ok(response, traceId);
      }

      const chatModelId = env.MODEL_ID ?? config.aiModels.chat;
      const fallbackModelId = env.FALLBACK_MODEL_ID ?? config.aiModels.chat;
      let answerText = '';
      let generationMs: number | undefined;
      try {
        const generationStart = performance.now();
        const result = await runGatewayChat(
          config.tenantId,
          config.aiGatewayId,
          chatModelId,
          buildRagMessages(rag.prompt),
          env,
          {
            stream: false,
            fallbackModelId,
            metadata: {
              traceId,
              route: '/search'
            }
          }
        );
        if (result.kind !== 'text') {
          throw new Error('Expected text result');
        }
        answerText = result.content.trim();
        generationMs = performance.now() - generationStart;
      } catch {
        void recordSearchMetrics(env, config.tenantId, {
          tenantId: config.tenantId,
          traceId,
          route: 'search',
          status: 'error',
          cacheHit: false,
          latencies: {
            totalMs: performance.now() - searchStartedAt,
            rewriteMs,
            embeddingMs,
            retrievalMs,
            ragAssemblyMs,
            generationMs
          },
          topK: requestedTopK,
          matchesReturned: matches.length
        });
        return fail('ai_error', 'AI provider unavailable', 502, traceId);
      }

      const followUpPrompt =
        'Given this Q&A pair, suggest 3-5 follow-up questions in JSON array format.\n' +
        `Q: ${originalQuery}\n` +
        `A: ${answerText}\n` +
        'Return only a JSON array like ["question1","question2"].';
      let followUps: string[] = [];
      let followUpGenerationMs: number | undefined;
      let followUpUsage: { in: number; out: number } | undefined;
      try {
        const followUpStart = performance.now();
        const followUpResult = await runGatewayChat(
          config.tenantId,
          config.aiGatewayId,
          chatModelId,
          [{ role: 'user', content: followUpPrompt }],
          env,
          {
            stream: false,
            fallbackModelId,
            metadata: {
              traceId,
              route: '/search'
            },
            onUsage: (usage) => {
              followUpUsage = {
                in: usage.tokensIn ?? 0,
                out: usage.tokensOut ?? 0
              };
            }
          }
        );
        if (followUpResult.kind === 'text') {
          followUps = extractJsonArray(followUpResult.content).slice(0, 5);
        }
        followUpGenerationMs = performance.now() - followUpStart;
      } catch {
        followUps = [];
      }

      const sources = chunks.map((chunk) => ({
        id: chunk.id,
        docId: chunk.metadata.docId,
        chunkId: chunk.metadata.chunkId,
        title: chunk.metadata.title,
        url: chunk.metadata.url,
        source: chunk.metadata.source,
        text: chunk.text,
        score: chunk.score
      }));

      const response: SearchResponse = {
        status: 'ok',
        traceId,
        answer: answerText || 'No answer available.',
        sources,
        confidence: computeConfidence(chunks.map((chunk) => chunk.score)),
        followUps
      };

      void setCachedSearch(config.tenantId, rewrittenQuery, response, 86400, env);
      try {
        const queryHash = await hashSearchQuery(rewrittenQuery);
        void recordCacheCheck(env, config.tenantId, {
          timestamp: Date.now(),
          hit: false,
          latencyMs: performance.now() - searchStartedAt,
          queryHash
        });
      } catch {
        // Ignore cache check hashing failures.
      }
      void recordSearchMetrics(env, config.tenantId, {
        tenantId: config.tenantId,
        traceId,
        route: 'search',
        status: 'success',
        cacheHit: false,
        latencies: {
          totalMs: performance.now() - searchStartedAt,
          rewriteMs,
          embeddingMs,
          retrievalMs,
          ragAssemblyMs,
          generationMs,
          followUpGenerationMs
        },
        tokensUsed: followUpUsage ? { followUpGeneration: followUpUsage } : undefined,
        topK: requestedTopK,
        matchesReturned: matches.length
      });

      return ok(response, traceId);
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
