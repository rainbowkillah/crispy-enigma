import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  getEffectiveSection,
  listEnvKeys,
  loadWranglerConfig,
  resolveEnvKey
} from '../lib/wrangler-config.mjs';

const tokenForTenant = (tenant) => {
  const normalized = tenant.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return (
    process.env[`CLOUDFLARE_API_TOKEN_${normalized}`] ??
    process.env.CLOUDFLARE_API_TOKEN ??
    null
  );
};

const usage = () => {
  console.error('Usage: npm run drift -- --tenant=<tenant-name> [--env=<env>]');
};

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const direct = args.find((arg) => arg.startsWith(`--${name}=`));
  if (direct) {
    return direct.split('=').slice(1).join('=');
  }
  const index = args.findIndex((arg) => arg === `--${name}`);
  if (index !== -1) {
    return args[index + 1];
  }
  return undefined;
};

const tenant = getArgValue('tenant');
const env = getArgValue('env');

if (!tenant || args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(tenant ? 0 : 1);
}

const tenantRoot = resolve('tenants', tenant);
const tenantConfigPath = resolve(tenantRoot, 'tenant.config.json');
const wranglerPath = resolve(tenantRoot, 'wrangler.jsonc');

if (!existsSync(tenantConfigPath)) {
  console.error(`Missing tenant config: ${tenantConfigPath}`);
  process.exit(1);
}
if (!existsSync(wranglerPath)) {
  console.error(`Missing wrangler config: ${wranglerPath}`);
  process.exit(1);
}

const validateArgs = ['scripts/validate-config.mjs', `--tenant=${tenant}`];
if (env) {
  validateArgs.push(`--env=${env}`);
}
const validate = spawnSync('node', validateArgs, { stdio: 'inherit' });
if (validate.status !== 0) {
  process.exit(validate.status ?? 1);
}

const tenantConfig = JSON.parse(readFileSync(tenantConfigPath, 'utf8'));
const wranglerConfig = loadWranglerConfig(wranglerPath);

let envKey = undefined;
if (env) {
  const resolution = resolveEnvKey(wranglerConfig, env);
  if (!resolution.envKey) {
    const available = listEnvKeys(wranglerConfig);
    console.error(
      `Unknown env "${env}". Available: ${available.length ? available.join(', ') : 'none'}`
    );
    process.exit(1);
  }
  if (resolution.envKey !== env) {
    console.warn(`Using env "${resolution.envKey}" (resolved from "${env}").`);
  }
  envKey = resolution.envKey;
}

const baseName = wranglerConfig.name;
const scriptName =
  (envKey && wranglerConfig.env?.[envKey]?.name) ||
  (envKey ? `${baseName}-${envKey}` : baseName);

const token = tokenForTenant(tenant);
if (!token) {
  console.error(
    `Missing API token. Set CLOUDFLARE_API_TOKEN_${tenant
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')} or CLOUDFLARE_API_TOKEN.`
  );
  process.exit(1);
}

const apiBase = 'https://api.cloudflare.com/client/v4';
const endpoint = `${apiBase}/accounts/${tenantConfig.accountId}/workers/scripts/${scriptName}/settings`;

const response = await fetch(endpoint, {
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  }
});

if (!response.ok) {
  const text = await response.text();
  console.error(`Cloudflare API error (${response.status}): ${text}`);
  process.exit(1);
}

const payload = await response.json();
if (!payload?.success) {
  console.error(`Cloudflare API error: ${JSON.stringify(payload, null, 2)}`);
  process.exit(1);
}

const result = payload.result ?? {};
const bindings =
  result.bindings ||
  result.script?.bindings ||
  result.settings?.bindings ||
  [];

const normalizeBindings = (items = []) => {
  const normalized = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const type = item.type || item.kind || 'unknown';
    const name = item.name || item.binding || item.namespace || item.bucket || item.id;
    if (typeof name === 'string' && name.length > 0) {
      normalized.push({ type, name });
    }
  }
  return normalized;
};

const collectBindings = (items, key = 'binding') =>
  Array.isArray(items)
    ? items.map((item) => item?.[key]).filter((binding) => typeof binding === 'string')
    : [];

const expectedBindings = [];
const kvBindings = collectBindings(getEffectiveSection(wranglerConfig, envKey, 'kv_namespaces'));
const d1Bindings = collectBindings(getEffectiveSection(wranglerConfig, envKey, 'd1_databases'));
const vectorizeBindings = collectBindings(getEffectiveSection(wranglerConfig, envKey, 'vectorize'));
const durableBindings = collectBindings(
  getEffectiveSection(wranglerConfig, envKey, 'durable_objects')?.bindings,
  'name'
);
const aiBinding = getEffectiveSection(wranglerConfig, envKey, 'ai')?.binding;
const vars = getEffectiveSection(wranglerConfig, envKey, 'vars') ?? {};

kvBindings.forEach((name) => expectedBindings.push({ type: 'kv_namespace', name }));
d1Bindings.forEach((name) => expectedBindings.push({ type: 'd1', name }));
vectorizeBindings.forEach((name) => expectedBindings.push({ type: 'vectorize', name }));
durableBindings.forEach((name) => expectedBindings.push({ type: 'durable_object_namespace', name }));
if (typeof aiBinding === 'string') {
  expectedBindings.push({ type: 'ai', name: aiBinding });
}
Object.entries(vars).forEach(([name, value]) => {
  const type = typeof value === 'string' ? 'plain_text' : 'json';
  expectedBindings.push({ type, name });
});

const actualBindings = normalizeBindings(bindings);

const byTypeName = (items) =>
  new Map(items.map((item) => [`${item.type}:${item.name}`, item]));

const expectedMap = byTypeName(expectedBindings);
const actualMap = byTypeName(actualBindings);

const missing = [];
for (const key of expectedMap.keys()) {
  if (!actualMap.has(key)) {
    missing.push(expectedMap.get(key));
  }
}

const extra = [];
for (const key of actualMap.keys()) {
  if (!expectedMap.has(key)) {
    extra.push(actualMap.get(key));
  }
}

const compatLocal = getEffectiveSection(wranglerConfig, envKey, 'compatibility_date');
const compatRemote =
  result.compatibility_date || result.script?.compatibility_date || null;

const drift = {
  tenant,
  env: envKey ?? 'base',
  scriptName,
  accountId: tenantConfig.accountId,
  checkedAt: new Date().toISOString(),
  compatibility: {
    expected: compatLocal ?? null,
    actual: compatRemote,
    match: compatLocal ? compatLocal === compatRemote : null
  },
  bindings: {
    expected: expectedBindings,
    actual: actualBindings,
    missing,
    extra
  }
};

const driftDir = resolve('drift');
mkdirSync(driftDir, { recursive: true });
const timestamp = drift.checkedAt.replace(/[:.]/g, '-');
const outputPath = resolve(driftDir, `${tenant}-${envKey ?? 'base'}-${timestamp}.json`);
writeFileSync(outputPath, JSON.stringify(drift, null, 2));

if (missing.length || (compatLocal && compatLocal !== compatRemote)) {
  console.error('Drift detected. See:', outputPath);
  process.exit(2);
}

console.log('No drift detected. Report:', outputPath);
