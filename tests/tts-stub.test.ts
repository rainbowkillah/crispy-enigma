import { describe, it, expect } from 'vitest';
import { StubTtsAdapter } from '../packages/tts/src/stub';
import type { TtsRequest } from '../packages/tts/src/schema';

describe('StubTtsAdapter', () => {
  it('throws an error when generate is called', async () => {
    const adapter = new StubTtsAdapter();
    const request: TtsRequest = {
      text: 'Hello',
      format: 'mp3',
      streaming: false,
      speed: 1,
    };
    await expect(adapter.generate(request)).rejects.toThrow('TTS provider not configured');
  });

  it('returns empty list for available voices', async () => {
    const adapter = new StubTtsAdapter();
    const voices = await adapter.getAvailableVoices();
    expect(voices).toEqual([]);
  });
});
