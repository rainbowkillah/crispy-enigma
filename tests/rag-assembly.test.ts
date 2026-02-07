import { describe, expect, it } from 'vitest';
import { assembleRagPrompt, type RagChunk } from '../packages/rag/src';

describe('assembleRagPrompt', () => {
  it('builds a prompt with context and citations', () => {
    const chunks: RagChunk[] = [
      {
        id: 'doc-1:chunk-1',
        text: 'Cloudflare Workers are serverless functions.',
        metadata: {
          tenantId: 'tenant-a',
          docId: 'doc-1',
          chunkId: 'chunk-1',
          source: 'docs'
        }
      }
    ];

    const result = assembleRagPrompt('What are Workers?', chunks);
    expect(result.prompt).toContain('Context:');
    expect(result.prompt).toContain('[source:doc-1#chunk-1]');
    expect(result.prompt).toContain('Question: What are Workers?');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.docId).toBe('doc-1');
    expect(result.citationsText).toContain('doc-1#chunk-1');
  });

  it('blocks unsafe questions', () => {
    const result = assembleRagPrompt('I want to kill myself', []);
    expect(result.prompt).toBe('');
    expect(result.safety?.allowed).toBe(false);
    expect(result.citationsText).toBe('(blocked)');
  });
});
