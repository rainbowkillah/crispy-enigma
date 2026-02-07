import type { Env } from '../../core/src/env';
import { runGatewayChat, type ChatModelMessage } from '../../ai/src/gateway';

export type QueryIntent = 'question' | 'statement' | 'command' | 'clarification';

const allowedIntents = new Set<QueryIntent>([
  'question',
  'statement',
  'command',
  'clarification'
]);

function normalizeIntent(value: string | undefined | null): QueryIntent {
  if (!value) {
    return 'question';
  }
  const normalized = value.trim().toLowerCase();
  if (allowedIntents.has(normalized as QueryIntent)) {
    return normalized as QueryIntent;
  }
  return 'question';
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function runIntentModel(
  tenantId: string,
  gatewayId: string,
  modelId: string,
  query: string,
  env: Env
): Promise<{ intent: QueryIntent; rewritten: string }> {
  const messages: ChatModelMessage[] = [
    {
      role: 'system',
      content:
        'You analyze search queries. Return only JSON with keys intent and rewritten.'
    },
    {
      role: 'user',
      content:
        'Classify the intent (question|statement|command|clarification) and rewrite the query for clarity.\n' +
        `Query: "${query}"\n` +
        'Return JSON like {"intent":"question","rewritten":"..."} with no extra text.'
    }
  ];

  const result = await runGatewayChat(
    tenantId,
    gatewayId,
    modelId,
    messages,
    env,
    {
      stream: false,
      fallbackModelId: env.FALLBACK_MODEL_ID,
      metadata: {
        route: '/search',
        query: 'rewrite'
      }
    }
  );

  if (result.kind !== 'text') {
    return { intent: 'question', rewritten: query };
  }

  const parsed = extractJsonObject(result.content);
  if (!parsed) {
    return { intent: 'question', rewritten: query };
  }

  const intent = normalizeIntent(
    typeof parsed.intent === 'string' ? parsed.intent : undefined
  );
  const rewritten =
    typeof parsed.rewritten === 'string' && parsed.rewritten.trim().length > 0
      ? parsed.rewritten.trim()
      : query;

  return { intent, rewritten };
}

export async function detectQueryIntent(
  tenantId: string,
  gatewayId: string,
  query: string,
  env: Env
): Promise<{ intent: QueryIntent; rewritten: string }> {
  const modelId = env.MODEL_ID ?? env.FALLBACK_MODEL_ID;
  if (!modelId) {
    return { intent: 'question', rewritten: query };
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runIntentModel(tenantId, gatewayId, modelId, query, env);
    } catch (error) {
      lastError = error;
    }
  }

  if (env.DEBUG_LOGGING) {
    console.warn('Query intent detection failed', {
      tenantId,
      gatewayId,
      error: lastError
    });
  }
  return { intent: 'question', rewritten: query };
}

export async function rewriteQuery(
  tenantId: string,
  gatewayId: string,
  originalQuery: string,
  env: Env
): Promise<string> {
  const result = await detectQueryIntent(tenantId, gatewayId, originalQuery, env);
  return result.rewritten || originalQuery;
}
