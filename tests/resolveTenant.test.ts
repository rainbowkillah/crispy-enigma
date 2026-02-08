import { describe, expect, it } from 'vitest';
import { resolveTenant } from '../packages/core/src/tenant/resolveTenant';

const makeRequest = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers });

describe('resolveTenant', () => {
  it('resolves tenant from header first', () => {
    const request = makeRequest('https://mrrainbowsmoke.local/health', {
      'x-tenant-id': 'header-tenant',
      'x-api-key': 'api-key'
    });

    const result = resolveTenant(request, {
      hostMap: { 'mrrainbowsmoke.local': 'host-tenant' },
      apiKeyMap: { 'api-key': 'api-tenant' }
    });

    expect(result).toEqual({ tenantId: 'header-tenant', source: 'header' });
  });

  it('resolves tenant from host when header is missing', () => {
    const request = makeRequest('https://mrrainbowsmoke.local/health');

    const result = resolveTenant(request, {
      hostMap: { 'mrrainbowsmoke.local': 'host-tenant' }
    });

    expect(result).toEqual({ tenantId: 'host-tenant', source: 'host' });
  });

  it('resolves tenant from api key last', () => {
    const request = makeRequest('https://mrrainbowsmoke.local/health', {
      'x-api-key': 'api-key'
    });

    const result = resolveTenant(request, {
      apiKeyMap: { 'api-key': 'api-tenant' }
    });

    expect(result).toEqual({ tenantId: 'api-tenant', source: 'apiKey' });
  });

  it('returns null when no tenant is resolved', () => {
    const request = makeRequest('https://mrrainbowsmoke.local/health');

    const result = resolveTenant(request);

    expect(result).toBeNull();
  });
});
