import type { Env } from '../../core/src/env';
import type { SearchResponse } from '../../core/src/rag/schema';

type CacheRecord = {
  response: SearchResponse;
  meta: {
    timestamp: number;
    docCount: number;
  };
};

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashSearchQuery(query: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(query);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

async function buildCacheKey(tenantId: string, query: string): Promise<string> {
  const hash = await hashSearchQuery(query);
  return `${tenantId}:search:${hash}`;
}

export async function getCachedSearch(
  tenantId: string,
  query: string,
  env: Env
): Promise<SearchResponse | null> {
  if (!env.CACHE || typeof env.CACHE.get !== 'function') {
    return null;
  }
  try {
    const key = await buildCacheKey(tenantId, query);
    const stored = await env.CACHE.get(key);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as CacheRecord;
    return parsed.response ?? null;
  } catch (error) {
    if (env.DEBUG_LOGGING) {
      console.warn('Search cache get failed', { tenantId, error });
    }
    return null;
  }
}

export async function setCachedSearch(
  tenantId: string,
  query: string,
  response: SearchResponse,
  ttlSeconds = 86400,
  env: Env
): Promise<void> {
  if (!env.CACHE || typeof env.CACHE.put !== 'function') {
    return;
  }
  try {
    const key = await buildCacheKey(tenantId, query);
    const record: CacheRecord = {
      response,
      meta: {
        timestamp: Date.now(),
        docCount: response.sources.length
      }
    };
    await env.CACHE.put(key, JSON.stringify(record), {
      expirationTtl: ttlSeconds
    });
  } catch (error) {
    if (env.DEBUG_LOGGING) {
      console.warn('Search cache set failed', { tenantId, error });
    }
  }
}
