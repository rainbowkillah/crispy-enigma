import { z } from 'zod';

export const ingestRequestSchema = z.object({
  docId: z.string().min(1),
  text: z.string().min(1),
  source: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  chunking: z
    .object({
      maxChunkSize: z.number().int().positive().optional(),
      overlap: z.number().int().min(0).optional()
    })
    .optional()
});

export const searchRequestSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().optional(),
  filter: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
