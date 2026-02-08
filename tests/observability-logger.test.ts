import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger, Logger } from '../packages/observability/src/logger';

describe('Logger', () => {
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  afterEach(() => {
    consoleSpy.mockClear();
  });

  it('should log structured JSON', () => {
    const logger = createLogger({ tenantId: 'test-tenant', traceId: 'test-trace' });
    logger.info('test-event', { foo: 'bar' });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logEntry = JSON.parse(consoleSpy.mock.calls[0][0]);
    
    expect(logEntry).toMatchObject({
      tenantId: 'test-tenant',
      traceId: 'test-trace',
      level: 'info',
      event: 'test-event',
      meta: { foo: 'bar' }
    });
    expect(logEntry.timestamp).toBeDefined();
  });

  it('should include route in context', () => {
    const logger = createLogger({ tenantId: 't', traceId: 'tr', route: '/api' });
    logger.info('event');
    const logEntry = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logEntry.route).toBe('/api');
  });

  it('should extend context', () => {
    const logger = createLogger({ tenantId: 't', traceId: 'tr' });
    const child = logger.withContext({ route: '/child' });
    child.info('event');
    const logEntry = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logEntry.route).toBe('/child');
    expect(logEntry.tenantId).toBe('t');
  });
});
