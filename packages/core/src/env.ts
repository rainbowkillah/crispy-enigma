export interface Env {
  AI: AI;
  VECTORIZE: Vectorize;
  CONFIG: KVNamespace;
  CACHE: KVNamespace;
  RATE_LIMITER: KVNamespace;
  DB: D1Database;
  CHAT_SESSION: DurableObjectNamespace;
  RATE_LIMITER_DO: DurableObjectNamespace;
}
