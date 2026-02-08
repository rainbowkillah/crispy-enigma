# Observability Dashboards

This document outlines the suggested dashboards and panels for monitoring the AI Worker system in Cloudflare.

## Overview Dashboard

| Panel Title | Visualization | Metric / Query | Description |
|---|---|---|---|
| Request Rate | Line Chart | `sum(requests)` by `route` | Traffic volume broken down by route (chat, search). |
| Error Rate | Line Chart | `sum(errors) / sum(requests)` | Percentage of failed requests. Alert if > 1%. |
| Latency (p95) | Line Chart | `histogram_quantile(0.95, latency)` | 95th percentile latency. |
| Active Tenants | Counter | `count(distinct tenantId)` | Number of unique tenants active in the last hour. |

## AI Performance

| Panel Title | Visualization | Metric / Query | Description |
|---|---|---|---|
| Token Usage | Bar Chart | `sum(tokensIn + tokensOut)` by `modelId` | Total tokens consumed per model. |
| AI Latency | Heatmap | `ai_latency` | Distribution of AI Gateway response times. |
| Cost Est. | Counter | `sum(cost)` | Estimated cost based on token usage. |

## Search & RAG

| Panel Title | Visualization | Metric / Query | Description |
|---|---|---|---|
| Cache Hit Rate | Gauge | `hits / (hits + misses)` | Search cache efficiency. Target > 50%. |
| Vectorize Latency | Line Chart | `retrievalMs` | Time taken for vector search. |
| Embedding Latency | Line Chart | `embeddingMs` | Time taken for query embedding. |

## Alerts

- **High Error Rate:** > 5% errors for 5 minutes.
- **High Latency:** p95 > 5s for 5 minutes.
- **Low Cache Hit Rate:** < 10% for 1 hour.
- **Cost Spike:** Cost > $10 in 1 hour.
