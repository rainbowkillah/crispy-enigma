import { z } from 'zod';

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  modelId: z.string().min(1).optional(),
  stream: z.boolean().optional().default(true),
  userId: z.string().min(1).optional()
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
