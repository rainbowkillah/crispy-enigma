import { z } from 'zod';

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  modelId: z.string().min(1).optional(),
  stream: z.boolean().optional().default(true),
  userId: z.string().min(1).optional(),
  tool_name: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
  tool_params: z.record(z.unknown()).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
