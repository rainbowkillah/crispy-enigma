import { TtsRequest, TtsResponse } from './schema';

export interface TtsAdapter {
  generate(request: TtsRequest, options?: { traceId?: string }): Promise<TtsResponse>;
  getAvailableVoices(): Promise<string[]>;
}
