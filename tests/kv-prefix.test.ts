import { describe, expect, it } from 'vitest';
import {
  TenantKVAdapter,
  tenantCacheKey,
  tenantKey
} from '../packages/storage/src/kv';

class FakeKV {
  public lastKey: string | null = null;
  public lastOptions: Record<string, unknown> | undefined;
  public store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    this.lastKey = key;
    return this.store.get(key) ?? null;
  }

  async put(
    key: string,
    value: string,
    options?: Record<string, unknown>
  ): Promise<void> {
    this.lastKey = key;
    this.lastOptions = options;
    this.store.set(key, value);
  }
}

describe('TenantKVAdapter', () => {
  it('prefixes keys with tenantId', async () => {
    const kv = new FakeKV();
    const adapter = new TenantKVAdapter(kv as unknown as KVNamespace);

    await adapter.put('tenant-a', 'token', 'value');

    expect(kv.lastKey).toBe(tenantKey('tenant-a', 'token'));
  });

  it('uses same prefix for get', async () => {
    const kv = new FakeKV();
    kv.store.set('tenant-a:token', 'value');

    const adapter = new TenantKVAdapter(kv as unknown as KVNamespace);
    const result = await adapter.get('tenant-a', 'token');

    expect(result).toBe('value');
    expect(kv.lastKey).toBe('tenant-a:token');
  });

  it('prefixes cache keys with tenantId and cache namespace', async () => {
    const kv = new FakeKV();
    const adapter = new TenantKVAdapter(kv as unknown as KVNamespace);

    await adapter.putCache('tenant-a', 'prompt', 'value', 120);

    expect(kv.lastKey).toBe(tenantCacheKey('tenant-a', 'prompt'));
    expect(kv.lastOptions).toEqual({ expirationTtl: 120 });
  });
});
