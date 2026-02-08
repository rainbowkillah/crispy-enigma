# Incident Response Runbook

This runbook covers detection, triage, mitigation, and post-incident actions.

## Severity Levels

- **P0:** Total outage or data loss. Immediate response required.
- **P1:** Major functionality impaired for multiple tenants.
- **P2:** Partial degradation or elevated error rates.
- **P3:** Minor issues, non-urgent.

## Detection

1. Alerts from metrics endpoints or dashboards.
2. User reports or support tickets.
3. CI/CD or deployment pipeline failures.

## Initial Triage

1. Identify tenant and environment affected.
2. Check `/health` and `/metrics/overview`.
3. Determine blast radius and severity.
4. Start an incident log with timestamp and responders.

## Mitigation Steps

1. If recent deploy caused the issue, execute the rollback runbook.
2. If rate limiting or capacity issues, reduce load or disable features via tenant config.
3. If upstream dependency failure, degrade features gracefully and communicate limitations.

## Communication

1. Announce status internally with severity and scope.
2. Provide an external update if user-impacting.
3. Update every 30–60 minutes until stable.

## Recovery Validation

1. `/health` returns `ok`.
2. Error rate and latency return to baseline.
3. Smoke checks pass for affected tenants.
4. Drift checks pass for the active deployment.

## Post-Incident

1. Record timeline, root cause, and mitigation actions.
2. Create follow-up tasks and owners.
3. Update runbooks if gaps were found.

## Status Update Template

```
Incident: <short summary>
Severity: P<0-3>
Started: <timestamp>
Impact: <who/what is affected>
Current Status: <mitigated/ongoing>
Next Update: <timestamp>
```
