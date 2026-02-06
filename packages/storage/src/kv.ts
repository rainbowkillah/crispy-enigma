export const tenantKey = (tenantId: string, key: string) => `${tenantId}:${key}`;
export const tenantCacheKey = (tenantId: string, key: string) =>
  `${tenantId}:cache:${key}`;

export class TenantKVAdapter {
  constructor(private kv: KVNamespace) {}

  async get(tenantId: string, key: string): Promise<string | null> {
    return this.kv.get(tenantKey(tenantId, key));
  }

  async put(
    tenantId: string,
    key: string,
    value: string,
    ttlSeconds?: number
  ): Promise<void> {
    if (ttlSeconds) {
      await this.kv.put(tenantKey(tenantId, key), value, {
        expirationTtl: ttlSeconds
      });
      return;
    }
    await this.kv.put(tenantKey(tenantId, key), value);
  }

  async getCache(tenantId: string, key: string): Promise<string | null> {
    return this.kv.get(tenantCacheKey(tenantId, key));
  }

  async putCache(
    tenantId: string,
    key: string,
    value: string,
    ttlSeconds = 3600
  ): Promise<void> {
    await this.kv.put(tenantCacheKey(tenantId, key), value, {
      expirationTtl: ttlSeconds
    });
  }
}
