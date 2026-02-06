import { describe, expect, it } from 'vitest';
import { TenantKVAdapter, tenantKey } from '../packages/storage/src/kv';

class FakeKV implements KVNamespace {
  public lastKey: string | null = null;
  public store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    this.lastKey = key;
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.lastKey = key;
    this.store.set(key, value);
  }

  async delete(): Promise<void> {
    throw new Error('not implemented');
  }

  async list(): Promise<KVNamespaceListResult<unknown, string>> {
    throw new Error('not implemented');
  }
}

describe('TenantKVAdapter', () => {
  it('prefixes keys with tenantId', async () => {
    const kv = new FakeKV();
    const adapter = new TenantKVAdapter(kv);

    await adapter.put('tenant-a', 'token', 'value');

    expect(kv.lastKey).toBe(tenantKey('tenant-a', 'token'));
  });

  it('uses same prefix for get', async () => {
    const kv = new FakeKV();
    kv.store.set('tenant-a:token', 'value');

    const adapter = new TenantKVAdapter(kv);
    const result = await adapter.get('tenant-a', 'token');

    expect(result).toBe('value');
    expect(kv.lastKey).toBe('tenant-a:token');
  });
});
