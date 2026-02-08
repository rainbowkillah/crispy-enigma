import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../packages/core/src';

// Mock tenant config
vi.mock('../tenants/index', () => ({
  tenantConfigs: [
    {
      tenantId: 'tts-enabled',
      accountId: 'test-account',
      aiGatewayId: 'test-gateway',
      aiModels: { chat: 'model-chat', embeddings: 'model-embed' },
      vectorizeNamespace: 'test-vec',
      rateLimit: { perMinute: 60, burst: 10 },
      featureFlags: { tts_enabled: true },
      allowedHosts: ['tts.local'],
      apiKeys: ['tts-key']
    },
    {
      tenantId: 'tts-disabled',
      accountId: 'test-account',
      aiGatewayId: 'test-gateway',
      aiModels: { chat: 'model-chat', embeddings: 'model-embed' },
      vectorizeNamespace: 'test-vec',
      rateLimit: { perMinute: 60, burst: 10 },
      featureFlags: { tts_enabled: false },
      allowedHosts: ['no-tts.local'],
      apiKeys: ['no-tts-key']
    }
  ]
}));

// Import worker AFTER mocking
import worker from '../apps/worker-api/src/index';

const env: Env = {
  AI: {} as Ai,
  VECTORIZE: {} as Vectorize,
  CONFIG: {} as KVNamespace,
  CACHE: {} as KVNamespace,
  RATE_LIMITER: {} as KVNamespace,
  DB: {} as D1Database,
  CHAT_SESSION: {} as DurableObjectNamespace,
  RATE_LIMITER_DO: {} as DurableObjectNamespace,
  MAX_REQUEST_BODY_SIZE: 10240
};

const fetchWorker = async (url: string, method: string, body?: any, headers: Record<string, string> = {}) => {
  return worker.fetch(new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  }), env);
};

describe('TTS Endpoint', () => {
  it('returns 403 if tts_enabled is false', async () => {
    const response = await fetchWorker('https://no-tts.local/tts', 'POST', { text: 'Hello' });
    expect(response.status).toBe(403);
    const json = await response.json() as any;
    expect(json.error.code).toBe('tts_not_enabled');
  });

  it('returns 500 (stub error) if tts_enabled is true but provider fails (stub)', async () => {
    const response = await fetchWorker('https://tts.local/tts', 'POST', { text: 'Hello' });
    expect(response.status).toBe(500);
    const json = await response.json() as any;
    expect(json.error.code).toBe('tts_error');
    expect(json.error.message).toContain('TTS provider not configured');
  });

  it('validates request body', async () => {
    const response = await fetchWorker('https://tts.local/tts', 'POST', { text: '' });
    expect(response.status).toBe(400);
    const json = await response.json() as any;
    expect(json.error.code).toBe('invalid_request');
  });

  it('rejects non-POST methods', async () => {
    const response = await fetchWorker('https://tts.local/tts', 'GET');
    expect(response.status).toBe(405);
  });
});
