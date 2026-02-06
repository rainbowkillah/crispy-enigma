import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';

const fetchWorker = async (url: string, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(url, { headers }));

const json = async (response: Response) => response.json();

describe('/health', () => {
  it('returns ok for header-based tenant', async () => {
    const response = await fetchWorker('https://example.local/health', {
      'x-tenant-id': 'example'
    });

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data.tenantId).toBe('example');
  });

  it('returns ok for host-based tenant', async () => {
    const response = await fetchWorker('https://alpha.local/health');

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data.tenantId).toBe('alpha');
  });

  it('returns ok for api key tenant', async () => {
    const response = await fetchWorker('https://unknown.local/health', {
      'x-api-key': 'alpha-key'
    });

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.ok).toBe(true);
    expect(body.data.tenantId).toBe('alpha');
  });

  it('rejects missing tenant', async () => {
    const response = await fetchWorker('https://unknown.local/health');

    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('tenant_required');
  });
});
