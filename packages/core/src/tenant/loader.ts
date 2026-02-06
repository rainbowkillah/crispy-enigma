import { tenantConfigSchema } from './schema';
import type { TenantConfig } from './schema';

export function loadTenantConfig(raw: unknown): TenantConfig {
  return tenantConfigSchema.parse(raw);
}

export function buildTenantIndex(configs: TenantConfig[]) {
  const hostMap: Record<string, string> = {};
  const apiKeyMap: Record<string, string> = {};
  const byId: Record<string, TenantConfig> = {};

  for (const config of configs) {
    byId[config.tenantId] = config;
    for (const host of config.allowedHosts) {
      hostMap[host] = config.tenantId;
    }
    for (const key of config.apiKeys) {
      apiKeyMap[key] = config.tenantId;
    }
  }

  return { hostMap, apiKeyMap, byId };
}
