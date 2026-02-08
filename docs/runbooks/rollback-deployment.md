# Rollback Runbook

Use this when a deployment causes errors, elevated latency, or user impact.

## Preconditions

- You can identify the bad deploy time or version.
- You have access to the tenant’s Cloudflare account.
- Deployment logs are available in `deployments/` (gitignored) or in CI artifacts.

## Identify the Bad Deploy

1. Check alerts and metrics for the first error spike.
2. Record the tenant, environment, and time window.
3. Find the last known good deployment log or git SHA.

## Rollback Options

### Option A: Redeploy last known good commit (preferred)

1. Checkout the last known good SHA or tag.
2. Deploy the tenant and env.

```bash
npm run deploy -- --tenant=<tenant> --env=staging
```

3. Validate health.

```bash
npm run smoke:dev -- --tenant=<tenant> --host=<worker-host>
```

### Option B: Wrangler rollback (if available)

1. Use Wrangler rollback for the tenant.

```bash
wrangler rollback --config tenants/<tenant>/wrangler.jsonc --env=<env>
```

2. Validate health using the smoke check.

### Option C: Cloudflare dashboard version history

1. Open Workers → Your Worker → Version History.
2. Select the last known good version and roll back.
3. Validate health using the smoke check.

## Post-Rollback Verification

1. `GET /health` returns `ok`.
2. Smoke check succeeds.
3. Error rate returns to baseline.
4. Drift check returns clean.

```bash
npm run drift -- --tenant=<tenant> --env=<env>
```

## Post-Incident Notes

1. Record the rollback decision and timestamp.
2. Capture the bad SHA and root cause summary.
3. Schedule a follow-up fix and redeploy.
