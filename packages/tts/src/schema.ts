import { z } from 'zod';

export const ttsRequestSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().optional(),
  format: z.enum(['mp3', 'wav', 'opus']).optional().default('mp3'),
  streaming: z.boolean().optional().default(false),
  speed: z.number().min(0.25).max(4.0).optional().default(1.0),
});

export type TtsRequest = z.infer<typeof ttsRequestSchema>;

export const ttsResponseSchema = z.object({
  contentType: z.string(),
  data: z.instanceof(ReadableStream).or(z.instanceof(Uint8Array)),
  usage: z.object({
    characters: z.number(),
    durationMs: z.number().optional(),
  }).optional(),
});

export type TtsResponse = z.infer<typeof ttsResponseSchema>;
