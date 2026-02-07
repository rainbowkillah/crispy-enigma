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

/** Schema for search responses returned by the RAG pipeline. */
export const searchResponseSchema = z.object({
  status: z.literal('ok'),
  traceId: z.string().optional(),
  answer: z.string().min(1).describe('Generated answer from RAG LLM'),
  sources: z
    .array(
      z.object({
        id: z.string(),
        docId: z.string(),
        chunkId: z.string(),
        title: z.string().optional(),
        url: z.string().optional(),
        source: z.string().optional(),
        text: z.string().describe('Direct quote from source'),
        score: z.number().min(0).max(1).optional()
      })
    )
    .min(0)
    .describe('Cited sources with confidence scoring'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Overall answer confidence (0-1)'),
  followUps: z
    .array(z.string())
    .min(0)
    .max(5)
    .describe('Suggested follow-up questions')
});

/** Type for search responses returned by the RAG pipeline. */
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type SearchRequest = z.infer<typeof searchRequestSchema>;
