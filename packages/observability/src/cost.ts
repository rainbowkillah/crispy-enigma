import type { Env } from '../../core/src/env';

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'llama-2-7b-chat-fp16': { input: 0.0002, output: 0.0002 },
  'llama-3-8b-instruct': { input: 0.0002, output: 0.0002 },
  '@cf/meta/llama-3-8b-instruct': { input: 0.0002, output: 0.0002 },
  'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'default': { input: 0.0002, output: 0.0002 }
};

export function calculateCost(modelId: string, tokensIn: number, tokensOut: number): number {
  const rates = MODEL_COSTS[modelId] || MODEL_COSTS['default'];
  return (tokensIn / 1000) * rates.input + (tokensOut / 1000) * rates.output;
}

export async function recordCost(
  tenantId: string,
  modelId: string,
  tokensIn: number,
  tokensOut: number,
  env: Env
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const cost = calculateCost(modelId, tokensIn, tokensOut);
  const entry = {
    tenantId,
    modelId,
    tokensIn,
    tokensOut,
    cost,
    timestamp: Date.now()
  };
  
  const suffix =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : String(Math.random()).slice(2);
  const key = `${tenantId}:cost:${entry.timestamp}:${suffix}`;

  try {
    await env.CACHE.put(key, JSON.stringify(entry), {
      expirationTtl: 604800, // 7 days
    });
  } catch {
    // Best-effort
  }
}

export async function getCostMetrics(
  tenantId: string,
  period: '1h' | '24h' | '7d',
  env: Env
): Promise<{ totalCost: number; totalTokens: number; byModel: Record<string, { cost: number; tokens: number }> }> {
  const result = {
    totalCost: 0,
    totalTokens: 0,
    byModel: {} as Record<string, { cost: number; tokens: number }>
  };

  if (!env.CACHE?.list) {
    return result;
  }

  const periodMs = {
    '1h': 3_600_000,
    '24h': 86_400_000,
    '7d': 604_800_000
  }[period];
  
  const cutoff = Date.now() - periodMs;
  const prefix = `${tenantId}:cost:`;
  let cursor: string | undefined;

  do {
    const listResult = await env.CACHE.list({ prefix, cursor });
    const validKeys = listResult.keys.filter(k => {
      const ts = Number(k.name.split(':')[2]);
      return ts >= cutoff;
    });

    const batchSize = 50;
    for (let i = 0; i < validKeys.length; i += batchSize) {
      const batch = validKeys.slice(i, i + batchSize);
      const values = await Promise.all(batch.map(k => env.CACHE.get(k.name)));
      
      for (const val of values) {
        if (!val) continue;
        try {
          const entry = JSON.parse(val);
          result.totalCost += entry.cost;
          result.totalTokens += (entry.tokensIn + entry.tokensOut);
          
          if (!result.byModel[entry.modelId]) {
            result.byModel[entry.modelId] = { cost: 0, tokens: 0 };
          }
          result.byModel[entry.modelId].cost += entry.cost;
          result.byModel[entry.modelId].tokens += (entry.tokensIn + entry.tokensOut);
        } catch {
          // ignore
        }
      }
    }
    cursor = listResult.list_complete ? undefined : (listResult.cursor as string);
  } while (cursor);

  return result;
}
