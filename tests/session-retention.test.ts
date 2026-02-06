import { describe, expect, it } from 'vitest';
import { pruneMessages } from '../apps/worker-api/src/session-do';

describe('pruneMessages', () => {
  it('drops messages older than retention window', () => {
    const now = Date.now();
    const messages = [
      {
        role: 'user' as const,
        content: 'old',
        timestamp: now - 40 * 24 * 60 * 60 * 1000
      },
      {
        role: 'user' as const,
        content: 'new',
        timestamp: now - 5 * 24 * 60 * 60 * 1000
      }
    ];

    const result = pruneMessages(messages, {
      now,
      retentionDays: 30,
      maxMessages: 1000
    });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('new');
  });

  it('caps messages to maxMessages', () => {
    const now = Date.now();
    const messages = Array.from({ length: 5 }, (_, index) => ({
      role: 'user' as const,
      content: `m${index}`,
      timestamp: now - index * 1000
    }));

    const result = pruneMessages(messages, {
      now,
      retentionDays: 30,
      maxMessages: 2
    });

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('m1');
    expect(result[1].content).toBe('m0');
  });
});
