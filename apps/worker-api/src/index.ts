import { tenantConfigs } from '../../../tenants/index';
import { buildTenantIndex, getTraceId, loadTenantConfig, ok, fail } from '../../../packages/core/src';
import { resolveTenant } from '../../../packages/core/src/tenant/resolveTenant';

const configs = tenantConfigs.map((config) => loadTenantConfig(config));
const tenantIndex = buildTenantIndex(configs);

export default {
  async fetch(request: Request): Promise<Response> {
    const traceId = getTraceId(request);
    const tenant = resolveTenant(request, {
      hostMap: tenantIndex.hostMap,
      apiKeyMap: tenantIndex.apiKeyMap
    });

    if (!tenant) {
      return fail('tenant_required', 'Tenant required', 400, traceId);
    }

    const config = tenantIndex.byId[tenant.tenantId];
    if (!config) {
      return fail('tenant_unknown', 'Unknown tenant', 404, traceId);
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return ok({ status: 'ok', tenantId: config.tenantId }, traceId);
    }

    return fail('not_found', 'Not found', 404, traceId);
  }
};
