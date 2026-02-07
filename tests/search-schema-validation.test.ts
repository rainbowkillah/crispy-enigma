import { describe, expect, it } from 'vitest';
import {
  searchRequestSchema,
  searchResponseSchema
} from '../packages/core/src/rag/schema';

describe('Search Schema Validation', () => {
  describe('SearchRequest validation', () => {
    it('accepts valid query string', () => {
      const req = { query: 'what is workers' };
      expect(searchRequestSchema.parse(req)).toBeDefined();
    });

    it('rejects empty query', () => {
      expect(() => searchRequestSchema.parse({ query: '' })).toThrow();
    });

    it('accepts optional topK', () => {
      const req = { query: 'test', topK: 10 };
      expect(searchRequestSchema.parse(req).topK).toBe(10);
    });

    it('accepts optional filter metadata', () => {
      const req = { query: 'test', filter: { source: 'docs', year: 2024 } };
      expect(searchRequestSchema.parse(req).filter).toBeDefined();
    });
  });

  describe('SearchResponse validation', () => {
    it('enforces answer as non-empty string', () => {
      const invalid = {
        status: 'ok',
        answer: '',
        sources: [],
        confidence: 0.5,
        followUps: []
      };
      expect(() => searchResponseSchema.parse(invalid)).toThrow();
    });

    it('enforces sources array with required fields', () => {
      const invalid = {
        status: 'ok',
        answer: 'test',
        sources: [{ id: 'id1' }],
        confidence: 0.5,
        followUps: []
      };
      expect(() => searchResponseSchema.parse(invalid)).toThrow();
    });

    it('enforces confidence 0-1 range', () => {
      const invalid = {
        status: 'ok',
        answer: 'test',
        sources: [],
        confidence: 1.5,
        followUps: []
      };
      expect(() => searchResponseSchema.parse(invalid)).toThrow();
    });

    it('enforces followUps max 5 items', () => {
      const invalid = {
        status: 'ok',
        answer: 'test',
        sources: [],
        confidence: 0.5,
        followUps: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']
      };
      expect(() => searchResponseSchema.parse(invalid)).toThrow();
    });

    it('parses valid SearchResponse', () => {
      const valid = {
        status: 'ok',
        answer: 'Workers is...',
        sources: [
          { id: 'match1', docId: 'doc1', chunkId: 'chunk1', text: 'quote', score: 0.95 }
        ],
        confidence: 0.88,
        followUps: ['How does scaling work?']
      };
      expect(searchResponseSchema.parse(valid)).toBeDefined();
    });

    it('accepts confidence boundary values', () => {
      const low = {
        status: 'ok',
        answer: 'test',
        sources: [],
        confidence: 0,
        followUps: []
      };
      const high = {
        status: 'ok',
        answer: 'test',
        sources: [],
        confidence: 1,
        followUps: []
      };
      expect(searchResponseSchema.parse(low).confidence).toBe(0);
      expect(searchResponseSchema.parse(high).confidence).toBe(1);
    });

    it('citations trace back to Vectorize metadata format', () => {
      const response = {
        status: 'ok',
        answer: 'test',
        sources: [
          {
            id: 'vec-id',
            docId: 'doc-id',
            chunkId: 'chunk-id',
            title: 'Doc Title',
            url: 'https://example.com',
            source: 'docs',
            text: 'excerpt',
            score: 0.92
          }
        ],
        confidence: 0.9,
        followUps: []
      };
      const parsed = searchResponseSchema.parse(response);
      expect(parsed.sources[0].docId).toBe('doc-id');
      expect(parsed.sources[0].text).toBeDefined();
    });
  });
});
