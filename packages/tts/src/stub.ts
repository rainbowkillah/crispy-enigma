import { TtsAdapter } from './adapter';
import { TtsRequest, TtsResponse } from './schema';

export class StubTtsAdapter implements TtsAdapter {
  async generate(_request: TtsRequest, _options?: { traceId?: string }): Promise<TtsResponse> {
    throw new Error('TTS provider not configured');
  }

  async getAvailableVoices(): Promise<string[]> {
    return [];
  }
}
