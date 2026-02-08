import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const env = envArg?.split('=')[1];
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg?.split('=')[1];
const continueOnError = process.argv.includes('--continue-on-error');

if (!env) {
  console.error(
    'Usage: npm run deploy:all -- --env=<env> [--only=tenant1,tenant2] [--continue-on-error]'
  );
  process.exit(1);
}

const tenantsRoot = resolve('tenants');
const tenants = readdirSync(tenantsRoot, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name)
  .filter((name) => existsSync(resolve(tenantsRoot, name, 'tenant.config.json')));

const requested = only ? only.split(',').map((value) => value.trim()).filter(Boolean) : null;
const selected = requested ? tenants.filter((tenant) => requested.includes(tenant)) : tenants;

if (requested && selected.length === 0) {
  console.error(`No matching tenants for --only=${only}. Available: ${tenants.join(', ')}`);
  process.exit(1);
}

const results = [];
for (const tenant of selected) {
  const result = spawnSync(
    'node',
    ['scripts/deploy-tenant.mjs', `--tenant=${tenant}`, `--env=${env}`],
    { stdio: 'inherit' }
  );
  const success = result.status === 0;
  results.push({
    tenant,
    success,
    exitCode: result.status ?? 1
  });
  if (!success && !continueOnError) {
    break;
  }
}

const failed = results.filter((entry) => !entry.success);
const deploymentDir = resolve('deployments');
mkdirSync(deploymentDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const summary = {
  env,
  selectedTenants: selected,
  results,
  failed: failed.map((entry) => entry.tenant)
};

const summaryPath = resolve(deploymentDir, `deploy-all-${env}-${timestamp}.json`);
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

if (failed.length > 0) {
  process.exit(1);
}

console.log(`Deploy-all succeeded for ${results.length} tenant(s).`);
