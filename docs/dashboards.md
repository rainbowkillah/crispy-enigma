# Dashboards and Alerts Suggestions

This document provides suggestions for creating dashboards and alerts to monitor the health, performance, and cost of the system.

## Dashboards

### Overview Dashboard

This dashboard should provide a high-level overview of the system's health.

- **Request Rate:** The number of requests per minute, broken down by endpoint and tenant.
- **Error Rate:** The number of errors per minute, broken down by endpoint and tenant.
- **Latency:** The 95th percentile latency for each endpoint, broken down by tenant.
- **Cost:** The total cost of the system, broken down by tenant and model.

### Chat Dashboard

This dashboard should provide a detailed view of the chat endpoint.

- **Message Rate:** The number of messages per minute, broken down by tenant.
- **Token Usage:** The number of tokens used per minute, broken down by tenant and model.
- **User Sessions:** The number of active user sessions, broken down by tenant.

### Search Dashboard

This dashboard should provide a detailed view of the search endpoint.

- **Search Rate:** The number of searches per minute, broken down by tenant.
- **Cache Hit Rate:** The cache hit rate for search queries, broken down by tenant.
- **Retrieval Quality:** The smoke score for the retrieval quality regression suite.

## Alerts

- **High Error Rate:** Alert when the error rate for any endpoint exceeds a certain threshold.
- **High Latency:** Alert when the 95th percentile latency for any endpoint exceeds a certain threshold.
- **High Cost:** Alert when the total cost of the system exceeds a certain threshold.
- **Low Cache Hit Rate:** Alert when the cache hit rate for search queries drops below a certain threshold.
- **Retrieval Quality Degradation:** Alert when the smoke score for the retrieval quality regression suite drops below a certain threshold.