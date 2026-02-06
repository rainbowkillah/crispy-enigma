export const tenantKey = (tenantId: string, key: string) => `${tenantId}:${key}`;

export class TenantKVAdapter {
  constructor(private kv: KVNamespace) {}

  async get(tenantId: string, key: string): Promise<string | null> {
    return this.kv.get(tenantKey(tenantId, key));
  }

  async put(tenantId: string, key: string, value: string): Promise<void> {
    await this.kv.put(tenantKey(tenantId, key), value);
  }
}
