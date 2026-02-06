export type TenantContext = {
  tenantId: string;
  accountId: string;
  aiGatewayId: string;
  aiModels: {
    chat: string;
    embeddings: string;
  };
  vectorizeNamespace: string;
  rateLimit: {
    perMinute: number;
    burst: number;
  };
  sessionRetentionDays: number;
  maxMessagesPerSession: number;
  featureFlags: Record<string, boolean>;
  allowedHosts: string[];
  apiKeys: string[];
};

export type TenantConfig = TenantContext;

export type ResolvedTenant = {
  tenantId: string;
  source: 'header' | 'host' | 'apiKey';
};
