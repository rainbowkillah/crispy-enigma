import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
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
const parseEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return {};
  }
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const envVars = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      envVars[key] = value;
    }
  }
  return envVars;
};

const resolveTenantEnvFile = (tenant, envName) => {
  const normalized = (envName || '').toLowerCase();
  const suffixMap = {
    dev: 'dev',
    develop: 'dev',
    development: 'dev',
    staging: 'stg',
    stg: 'stg',
    preview: 'stg',
    prod: null,
    production: null,
    prd: null
  };
  const mappedSuffix = suffixMap[normalized];
  const candidates = [];
  if (normalized) {
    candidates.push(`.env.${normalized}`);
  }
  if (mappedSuffix) {
    candidates.push(`.env.${mappedSuffix}`);
  }
  candidates.push('.env');

  for (const candidate of candidates) {
    const candidatePath = resolve(tenantsRoot, tenant, candidate);
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
};

const tokenKeyForTenant = (tenant) =>
  `CLOUDFLARE_API_TOKEN_${tenant.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

for (const tenant of selected) {
  const envFile = resolveTenantEnvFile(tenant, env);
  const envVars = envFile ? parseEnvFile(envFile) : {};
  const tokenKey = tokenKeyForTenant(tenant);
  const tenantEnv = {
    ...process.env
  };
  if (envVars.CLOUDFLARE_API_TOKEN) {
    tenantEnv[tokenKey] = envVars.CLOUDFLARE_API_TOKEN;
    tenantEnv.CLOUDFLARE_API_TOKEN = envVars.CLOUDFLARE_API_TOKEN;
  }
  const result = spawnSync(
    'node',
    ['scripts/deploy-tenant.mjs', `--tenant=${tenant}`, `--env=${env}`],
    { stdio: 'inherit', env: tenantEnv }
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
