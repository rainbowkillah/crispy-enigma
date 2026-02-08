import { describe, it, expect, vi } from 'vitest';
import { hashToolParams, recordToolAudit } from '../packages/tools/src/audit';
import type { Env } from '../packages/core/src/env';

function createMockEnv() {
  const stored: Record<string, { value: string; ttl?: number }> = {};
  return {
    env: {
      AI: {} as Ai,
      VECTORIZE: {} as Vectorize,
      CONFIG: {} as KVNamespace,
      CACHE: {
        put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
          stored[key] = { value, ttl: opts?.expirationTtl };
        },
        get: async (key: string) => stored[key]?.value ?? null,
        list: async () => ({ keys: [], list_complete: true, cursor: '' }),
      } as unknown as KVNamespace,
      RATE_LIMITER: {} as KVNamespace,
      DB: {} as D1Database,
      CHAT_SESSION: {} as DurableObjectNamespace,
      RATE_LIMITER_DO: {} as DurableObjectNamespace,
    } as Env,
    stored,
  };
}

describe('Tool Audit', () => {
  it('hashToolParams returns consistent hex hash', async () => {
    const hash1 = await hashToolParams({ text: 'hello' });
    const hash2 = await hashToolParams({ text: 'hello' });
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashToolParams returns different hash for different params', async () => {
    const hash1 = await hashToolParams({ text: 'hello' });
    const hash2 = await hashToolParams({ text: 'world' });
    expect(hash1).not.toBe(hash2);
  });

  it('recordToolAudit writes to CACHE KV with correct key pattern', async () => {
    const { env, stored } = createMockEnv();
    const timestamp = Date.now();
    await recordToolAudit(
      {
        tenantId: 'test-tenant',
        toolName: 'summarize',
        requestId: 'req-123',
        userId: 'user-1',
        paramsHash: 'abc123',
        success: true,
        durationMs: 150,
        timestamp,
      },
      env
    );

    const keys = Object.keys(stored);
    expect(keys.length).toBe(1);
    expect(keys[0]).toMatch(/^test-tenant:tools:audit:\d+:/);

    const entry = JSON.parse(stored[keys[0]].value);
    expect(entry.tenantId).toBe('test-tenant');
    expect(entry.toolName).toBe('summarize');
    expect(entry.success).toBe(true);
    expect(stored[keys[0]].ttl).toBe(604800);
  });

  it('recordToolAudit handles missing CACHE gracefully', async () => {
    const env = {
      AI: {} as Ai,
      VECTORIZE: {} as Vectorize,
      CONFIG: {} as KVNamespace,
      CACHE: {} as KVNamespace, // no put method
      RATE_LIMITER: {} as KVNamespace,
      DB: {} as D1Database,
      CHAT_SESSION: {} as DurableObjectNamespace,
      RATE_LIMITER_DO: {} as DurableObjectNamespace,
    } as Env;

    // Should not throw
    await recordToolAudit(
      {
        tenantId: 'test-tenant',
        toolName: 'summarize',
        requestId: 'req-123',
        paramsHash: 'abc',
        success: true,
        durationMs: 100,
        timestamp: Date.now(),
      },
      env
    );
  });

  it('recordToolAudit stores error code on failure', async () => {
    const { env, stored } = createMockEnv();
    await recordToolAudit(
      {
        tenantId: 'test-tenant',
        toolName: 'summarize',
        requestId: 'req-123',
        paramsHash: 'abc',
        success: false,
        durationMs: 50,
        errorCode: 'EXECUTION_ERROR',
        timestamp: Date.now(),
      },
      env
    );

    const keys = Object.keys(stored);
    const entry = JSON.parse(stored[keys[0]].value);
    expect(entry.success).toBe(false);
    expect(entry.errorCode).toBe('EXECUTION_ERROR');
  });
});
