import { recordMetric, type Env, type MetricEntry } from '../../observability/src/metrics';

export class Metrics {
  private tenantId: string;
  private env: Env;

  constructor(tenantId: string, env: Env) {
    this.tenantId = tenantId;
    this.env = env;
  }

  counter(metricName: string, value: number, tags?: Record<string, string>): void {
    const entry: MetricEntry = {
      tenantId: this.tenantId,
      metricName,
      value,
      timestamp: Date.now(),
      tags,
      type: 'counter',
    };
    void recordMetric(entry, this.env);
  }

  gauge(metricName: string, value: number, tags?: Record<string, string>): void {
    const entry: MetricEntry = {
      tenantId: this.tenantId,
      metricName,
      value,
      timestamp: Date.now(),
      tags,
      type: 'gauge',
    };
    void recordMetric(entry, this.env);
  }

  histogram(metricName: string, value: number, tags?: Record<string, string>): void {
    const entry: MetricEntry = {
      tenantId: this.tenantId,
      metricName,
      value,
      timestamp: Date.now(),
      tags,
      type: 'histogram',
    };
    void recordMetric(entry, this.env);
  }
}

export function createMetrics(tenantId: string, env: Env): Metrics {
  return new Metrics(tenantId, env);
}
