export interface Env {
  AI: AI;
  VECTORIZE: Vectorize;
  TENANT_KV: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  RATE_LIMITER_DO: DurableObjectNamespace;
}
