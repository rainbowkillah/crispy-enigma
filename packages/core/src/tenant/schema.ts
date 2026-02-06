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
    burst: z.number().int().positive()
  }),
  featureFlags: z.record(z.boolean()),
  allowedHosts: z.array(z.string()),
  apiKeys: z.array(z.string())
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;
