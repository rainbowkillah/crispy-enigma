import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getCachedSearch,
  setCachedSearch,
  hashSearchQuery
} from '../packages/storage/src/search-cache';
import type { Env, SearchResponse } from '../packages/core/src';

type StoredValue = { value: string; expiresAt?: number };

class FakeKV {
  public store = new Map<string, StoredValue>();
  public lastKey: string | null = null;
  public lastOptions: Record<string, unknown> | undefined;

  async get(key: string): Promise<string | null> {
    this.lastKey = key;
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void> {
    this.lastKey = key;
    this.lastOptions = options;
    const expiresAt = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiresAt });
  }
}

describe('Search Caching', () => {
  let kv: FakeKV;
  let env: Env;

  const makeResponse = (answer: string, confidence = 0.5): SearchResponse => ({
    status: 'ok',
    answer,
    sources: [],
    confidence,
    followUps: []
  });

  beforeEach(() => {
    kv = new FakeKV();
    env = {
      CACHE: kv as unknown as KVNamespace
    } as Env;
    vi.useRealTimers();
  });

  it('returns null on first cache miss', async () => {
    const result = await getCachedSearch('tenant1', 'query1', env);
    expect(result).toBeNull();
  });

  it('populates cache on setCachedSearch', async () => {
    const response = makeResponse('test');
    await setCachedSearch('tenant1', 'query1', response, 86400, env);
    const cached = await getCachedSearch('tenant1', 'query1', env);
    expect(cached).toEqual(response);
  });

  it('separates cache per tenant', async () => {
    const response1 = makeResponse('tenant1 answer', 0.5);
    const response2 = makeResponse('tenant2 answer', 0.3);

    await setCachedSearch('tenant1', 'same-query', response1, 86400, env);
    await setCachedSearch('tenant2', 'same-query', response2, 86400, env);

    const cache1 = await getCachedSearch('tenant1', 'same-query', env);
    const cache2 = await getCachedSearch('tenant2', 'same-query', env);

    expect(cache1?.answer).toBe('tenant1 answer');
    expect(cache2?.answer).toBe('tenant2 answer');
  });

  it('expires cache after TTL', async () => {
    vi.useFakeTimers();
    const response = makeResponse('test');
    await setCachedSearch('tenant1', 'ttl-query', response, 1, env);
    let cached = await getCachedSearch('tenant1', 'ttl-query', env);
    expect(cached).toBeDefined();
    vi.advanceTimersByTime(1100);
    cached = await getCachedSearch('tenant1', 'ttl-query', env);
    expect(cached).toBeNull();
    vi.useRealTimers();
  });

  it('uses rewritten query for cache key (not original)', async () => {
    const original = 'how do workers work';
    const rewritten = 'Explain Cloudflare Workers architecture';
    const response = makeResponse('Workers is a...', 0.7);
    await setCachedSearch('tenant1', rewritten, response, 86400, env);

    expect(await getCachedSearch('tenant1', original, env)).toBeNull();
    expect(await getCachedSearch('tenant1', rewritten, env)).toBeDefined();
  });

  it('cache key includes tenant isolation boundary', async () => {
    const response = makeResponse('test');
    await setCachedSearch('tenant-a', 'query', response, 86400, env);
    const hash = await hashSearchQuery('query');
    expect(kv.lastKey).toBe(`tenant-a:search:${hash}`);
  });

  it('uses default TTL when not provided', async () => {
    const response = makeResponse('test');
    await setCachedSearch('tenant-a', 'query', response, undefined, env);
    expect(kv.lastOptions).toEqual({ expirationTtl: 86400 });
  });

  it('returns null for corrupted cache payloads', async () => {
    const hash = await hashSearchQuery('bad');
    kv.store.set(`tenant1:search:${hash}`, { value: '{not-json' });
    const result = await getCachedSearch('tenant1', 'bad', env);
    expect(result).toBeNull();
  });

  it('distinguishes different queries for the same tenant', async () => {
    const response = makeResponse('test');
    await setCachedSearch('tenant1', 'query-a', response, 86400, env);
    const miss = await getCachedSearch('tenant1', 'query-b', env);
    expect(miss).toBeNull();
  });

  it('hashSearchQuery is stable for identical inputs', async () => {
    const first = await hashSearchQuery('repeat');
    const second = await hashSearchQuery('repeat');
    expect(first).toBe(second);
  });
});
