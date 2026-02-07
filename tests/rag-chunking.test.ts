import { describe, expect, it } from 'vitest';
import { chunkText } from '../packages/rag/src';

describe('chunkText', () => {
  it('returns empty for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('chunks by max size with overlap', () => {
    const text = 'one two three four five six seven eight nine';
    const chunks = chunkText(text, { maxChunkSize: 14, overlap: 4 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(14);
      expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
    }

    expect(chunks[0]?.text).toBe('one two three');
    expect(chunks[1]?.text).toContain('three');
  });

  it('splits single long words', () => {
    const text = 'supercalifragilisticexpialidocious';
    const chunks = chunkText(text, { maxChunkSize: 10, overlap: 0 });

    expect(chunks).toHaveLength(4);
    expect(chunks[0]?.text).toBe('supercalif');
    expect(chunks[3]?.text).toBe('ious');
  });
});
