import type { Env } from '../../core/src/env.js';

export type ToolAuditEntry = {
  tenantId: string;
  toolName: string;
  requestId: string;
  userId?: string;
  paramsHash: string;
  success: boolean;
  durationMs: number;
  errorCode?: string;
  timestamp: number;
};

export async function hashToolParams(params: unknown): Promise<string> {
  const serialized = JSON.stringify(params ?? {});
  const encoded = new TextEncoder().encode(serialized);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function recordToolAudit(
  entry: ToolAuditEntry,
  env: Env
): Promise<void> {
  if (!env.CACHE?.put) {
    return;
  }
  const suffix =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : String(Math.random()).slice(2);
  const key = `${entry.tenantId}:tools:audit:${entry.timestamp}:${suffix}`;
  try {
    await env.CACHE.put(key, JSON.stringify(entry), {
      expirationTtl: 604800, // 7 days
    });
  } catch {
    // Best-effort; do not throw on audit write failure.
  }
}
