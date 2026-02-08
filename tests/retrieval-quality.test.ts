import { describe, expect, it } from 'vitest';
import worker from '../apps/worker-api/src/index';
import type { Env, SearchResponse } from '../packages/core/src';

const baseEnv: Env = {
  AI: {
    run: async (_model: string, input: unknown) => {
      if (typeof input === 'object' && input !== null) {
        const record = input as { prompt?: unknown; text?: unknown };
        if (Array.isArray(record.text)) {
          return { embeddings: record.text.map(() => [0.1, 0.2, 0.3]) };
        }
        const prompt = typeof record.prompt === 'string' ? record.prompt : '';
        if (prompt.includes('follow-up')) {
          return { response: '[]' };
        }
      }
      return { response: 'test answer' };
    }
  } as unknown as Ai,
  VECTORIZE: {
    query: async () => ({
      matches: [
        { id: 'test-id', score: 0.9, metadata: { text: 'test chunk' } }
      ]
    }),
    insert: async () => ([])
  } as unknown as Vectorize,
  CONFIG: {} as KVNamespace,
  CACHE: new Map() as unknown as KVNamespace,
  RATE_LIMITER: {} as KVNamespace,
  DB: {} as D1Database,
  CHAT_SESSION: {} as DurableObjectNamespace,
  RATE_LIMITER_DO: {} as DurableObjectNamespace
};

const makeSearchRequest = (query: string) =>
  new Request('https://mrrainbowsmoke.local/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': 'mrrainbowsmoke'
    },
    body: JSON.stringify({ query })
  });

type SmokeTestCase = {
  query: string;
  expectedConfidence: number;
  expectedSources: number;
};

const smokeTestSuite: SmokeTestCase[] = [
  {
    query: 'what is workers?',
    expectedConfidence: 0.9,
    expectedSources: 1
  },
  {
    query: 'how do i use wrangler?',
    expectedConfidence: 0.85,
    expectedSources: 1
  },
  {
    query: 'what is the meaning of life?',
    expectedConfidence: 0.5,
    expectedSources: 0
  }
];

describe('Retrieval Quality Smoke Score', () => {
  for (const { query, expectedConfidence, expectedSources } of smokeTestSuite) {
    it(`'${query}' should meet quality standards`, async () => {
      const response = await worker.fetch(makeSearchRequest(query), baseEnv);
      expect(response.status).toBe(200);

      const result = await response.json() as { ok: boolean, data: SearchResponse };
      expect(result.ok).toBe(true);

      const { confidence, sources } = result.data;
      expect(confidence).toBeGreaterThanOrEqual(expectedConfidence);
      expect(sources.length).toBeGreaterThanOrEqual(expectedSources);
    });
  }
});
