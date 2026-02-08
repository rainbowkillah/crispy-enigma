import { z } from 'zod';

export const tenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().min(1),
  aiGatewayId: z.string().min(1),
  aiModels: z.object({
    chat: z.string().min(1),
    embeddings: z.string().min(1)
  }),
  vectorizeNamespace: z.string().min(1),
  rateLimit: z.object({
    perMinute: z.number().int().positive(),
    burst: z.number().int().positive(),
    windowSec: z.number().int().min(1).max(3600).optional().default(60),
    burstWindowSec: z.number().int().min(1).max(600).optional()
  }),
  tokenBudget: z
    .object({
      daily: z.number().int().positive().optional(),
      monthly: z.number().int().positive().optional()
    })
    .optional(),
  sessionRetentionDays: z.number().int().positive().optional().default(30),
  maxMessagesPerSession: z.number().int().positive().optional().default(1000),
  featureFlags: z.record(z.boolean()),
  allowedModels: z.array(z.string().min(1)).optional().default([]),
  allowedHosts: z.array(z.string()),
  apiKeys: z.array(z.string())
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;
