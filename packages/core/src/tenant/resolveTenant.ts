import type { ResolvedTenant } from './types';

export type ResolveTenantOptions = {
  hostMap?: Record<string, string>;
  apiKeyMap?: Record<string, string>;
};

export function resolveTenant(
  request: Request,
  options: ResolveTenantOptions = {}
): ResolvedTenant | null {
  const headerTenantId = request.headers.get('x-tenant-id');
  if (headerTenantId) {
    return { tenantId: headerTenantId, source: 'header' };
  }

  const hostname = new URL(request.url).hostname;
  const hostTenantId = options.hostMap?.[hostname];
  if (hostTenantId) {
    return { tenantId: hostTenantId, source: 'host' };
  }

  const apiKey = request.headers.get('x-api-key');
  const apiKeyTenantId = apiKey ? options.apiKeyMap?.[apiKey] : undefined;
  if (apiKeyTenantId) {
    return { tenantId: apiKeyTenantId, source: 'apiKey' };
  }

  return null;
}
