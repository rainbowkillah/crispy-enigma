export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  CONFIG: KVNamespace;
  CACHE: KVNamespace;
  RATE_LIMITER: KVNamespace;
  DB: D1Database;
  CHAT_SESSION: DurableObjectNamespace;
  RATE_LIMITER_DO: DurableObjectNamespace;
  ENVIRONMENT?: string;
  MODEL_ID?: string;
  EMBEDDING_MODEL_ID?: string;
  FALLBACK_MODEL_ID?: string;
  RATE_LIMIT_KEYS_PER_MINUTE?: number;
  MAX_REQUEST_BODY_SIZE?: number;
  MAX_MESSAGE_COUNT?: number;
  MAX_MESSAGE_LENGTH?: number;
  DEBUG_LOGGING?: boolean;
  CF_AIG_TOKEN?: string;
}
