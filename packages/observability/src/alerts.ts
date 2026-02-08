import type { Env } from '../../core/src/env';
import type { SliSummary } from './slis';
import { flattenSliMetrics } from './slis';

export type AlertComparator = '>' | '>=' | '<' | '<=';

export type AlertRule = {
  id: string;
  name: string;
  metric: string;
  comparator: AlertComparator;
  threshold: number;
  period: '1h' | '24h' | '7d';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AlertEvaluation = {
  ruleId: string;
  name: string;
  metric: string;
  comparator: AlertComparator;
  threshold: number;
  period: '1h' | '24h' | '7d';
  value: number | null;
  triggered: boolean;
  evaluatedAt: number;
  reason?: string;
};

const ALERT_RULES_KEY = (tenantId: string) => `${tenantId}:alerts:rules`;

function normalizeRule(rule: Partial<AlertRule>): AlertRule {
  const now = Date.now();
  return {
    id: rule.id ?? crypto.randomUUID(),
    name: rule.name ?? 'Alert rule',
    metric: rule.metric ?? 'search.error_rate',
    comparator: rule.comparator ?? '>',
    threshold: typeof rule.threshold === 'number' ? rule.threshold : 0,
    period: (rule.period ?? '24h') as '1h' | '24h' | '7d',
    enabled: rule.enabled ?? true,
    createdAt: rule.createdAt ?? now,
    updatedAt: now,
  };
}

export async function getAlertRules(
  tenantId: string,
  env: Env
): Promise<AlertRule[]> {
  if (!env.CONFIG?.get) {
    return [];
  }
  const raw = await env.CONFIG.get(ALERT_RULES_KEY(tenantId));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as AlertRule[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((rule) => normalizeRule(rule));
  } catch {
    return [];
  }
}

export async function saveAlertRules(
  tenantId: string,
  rules: AlertRule[],
  env: Env
): Promise<void> {
  if (!env.CONFIG?.put) {
    return;
  }
  await env.CONFIG.put(ALERT_RULES_KEY(tenantId), JSON.stringify(rules));
}

export async function upsertAlertRules(
  tenantId: string,
  inputRules: Partial<AlertRule>[],
  env: Env
): Promise<AlertRule[]> {
  const existing = await getAlertRules(tenantId, env);
  const byId = new Map(existing.map((rule) => [rule.id, rule]));

  for (const rule of inputRules) {
    const normalized = normalizeRule(rule);
    byId.set(normalized.id, {
      ...normalized,
      createdAt: byId.get(normalized.id)?.createdAt ?? normalized.createdAt,
    });
  }

  const updated = Array.from(byId.values());
  await saveAlertRules(tenantId, updated, env);
  return updated;
}

export async function deleteAlertRule(
  tenantId: string,
  ruleId: string,
  env: Env
): Promise<AlertRule[]> {
  const existing = await getAlertRules(tenantId, env);
  const updated = existing.filter((rule) => rule.id !== ruleId);
  await saveAlertRules(tenantId, updated, env);
  return updated;
}

function compare(value: number, comparator: AlertComparator, threshold: number): boolean {
  switch (comparator) {
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
    default:
      return false;
  }
}

export function evaluateAlertRules(
  rules: AlertRule[],
  summary: SliSummary
): AlertEvaluation[] {
  const metrics = flattenSliMetrics(summary);
  const evaluatedAt = Date.now();

  return rules.map((rule) => {
    const value = metrics[rule.metric];
    if (value === undefined || value === null) {
      return {
        ruleId: rule.id,
        name: rule.name,
        metric: rule.metric,
        comparator: rule.comparator,
        threshold: rule.threshold,
        period: rule.period,
        value: null,
        triggered: false,
        evaluatedAt,
        reason: 'metric_not_found',
      };
    }

    const triggered = rule.enabled && compare(value, rule.comparator, rule.threshold);

    return {
      ruleId: rule.id,
      name: rule.name,
      metric: rule.metric,
      comparator: rule.comparator,
      threshold: rule.threshold,
      period: rule.period,
      value,
      triggered,
      evaluatedAt,
    };
  });
}
