import { tenantConfigs } from '../../../tenants/index';
import {
  buildTenantIndex,
  fail,
  getTraceId,
  loadTenantConfig,
  ok,
  type Env
} from '../../../packages/core/src';
import { resolveTenant } from '../../../packages/core/src/tenant/resolveTenant';

const configs = tenantConfigs.map((config) => loadTenantConfig(config));
const tenantIndex = buildTenantIndex(configs);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    const maxBodySize = env.MAX_REQUEST_BODY_SIZE ?? 10240;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const contentLength = request.headers.get('content-length');
      if (contentLength && Number(contentLength) > maxBodySize) {
        return fail('payload_too_large', 'Request body too large', 413, traceId);
      }

      if (!contentLength) {
        const body = await request.clone().arrayBuffer();
        if (body.byteLength > maxBodySize) {
          return fail('payload_too_large', 'Request body too large', 413, traceId);
        }
      }
    }
    if (url.pathname === '/health') {
      const modelId = env.MODEL_ID ?? config.aiModels.chat;
      const fallbackModelId = env.FALLBACK_MODEL_ID ?? config.aiModels.chat;
      return ok(
        {
          status: 'ok',
          tenantId: config.tenantId,
          environment: env.ENVIRONMENT ?? 'unknown',
          modelId,
          fallbackModelId
        },
        traceId
      );
    }

    return fail('not_found', 'Not found', 404, traceId);
  }
};
