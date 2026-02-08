import { describe, it, expect } from 'vitest';
import { extractTraceId, generateTraceId } from '../packages/observability/src/trace';

describe('Trace', () => {
  it('should generate a UUID', () => {
    const traceId = generateTraceId();
    expect(traceId).toHaveLength(36); // UUID length
  });

  it('should extract trace ID from header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-trace-id': 'existing-trace' }
    });
    expect(extractTraceId(request)).toBe('existing-trace');
  });

  it('should generate new trace ID if header missing', () => {
    const request = new Request('http://localhost');
    const traceId = extractTraceId(request);
    expect(traceId).toHaveLength(36);
  });
});
