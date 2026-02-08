import { describe, it, expect } from 'vitest';
import { ttsRequestSchema } from '../packages/tts/src/schema';

describe('TTS Schema', () => {
  it('validates a minimal request', () => {
    const valid = {
      text: 'Hello world',
    };
    const result = ttsRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe('mp3');
      expect(result.data.streaming).toBe(false);
      expect(result.data.speed).toBe(1.0);
    }
  });

  it('validates a full request', () => {
    const valid = {
      text: 'Hello world',
      voice: 'en-US-Standard-A',
      format: 'wav',
      streaming: true,
      speed: 1.5,
    };
    const result = ttsRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects empty text', () => {
    const invalid = {
      text: '',
    };
    const result = ttsRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects text too long', () => {
    const invalid = {
      text: 'a'.repeat(5001),
    };
    const result = ttsRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid format', () => {
    const invalid = {
      text: 'Hello',
      format: 'invalid',
    };
    const result = ttsRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid speed', () => {
    const invalid = {
      text: 'Hello',
      speed: 5.0,
    };
    const result = ttsRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
