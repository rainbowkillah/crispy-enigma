import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import {
  getEffectiveSection,
  listEnvKeys,
  loadWranglerConfig,
  resolveEnvKey
} from './lib/wrangler-config.mjs';

const tenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().min(1),
  aiGatewayId: z.string().min(1),
  aiModels: z.object({
    chat: z.string().min(1),
    embeddings: z.string().min(1)
  }),
  vectorizeNamespace: z.string().min(1),
  rateLimit: z.object({
    perMinute: z.number().int().positive(),
    burst: z.number().int().positive(),
    windowSec: z.number().int().min(1).max(3600).optional().default(60),
    burstWindowSec: z.number().int().min(1).max(600).optional()
  }),
  tokenBudget: z
    .object({
      daily: z.number().int().positive().optional(),
      monthly: z.number().int().positive().optional()
    })
    .optional(),
  sessionRetentionDays: z.number().int().positive().optional().default(30),
  maxMessagesPerSession: z.number().int().positive().optional().default(1000),
  featureFlags: z.record(z.boolean()),
  allowedModels: z.array(z.string().min(1)).optional().default([]),
  allowedHosts: z.array(z.string()),
  apiKeys: z.array(z.string())
});

const REQUIRED_BINDINGS = {
  kv: ['RATE_LIMITER', 'CONFIG', 'CACHE'],
  d1: ['DB'],
  durable: ['RATE_LIMITER_DO', 'CHAT_SESSION'],
  vectorize: ['VECTORIZE'],
  ai: ['AI']
};

const usage = () => {
  console.error('Usage: npm run validate -- --tenant=<name|all> [--env=<env>]');
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

const tenantArg = getArgValue('tenant');
const envArg = getArgValue('env');

if (!tenantArg || args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(tenantArg ? 0 : 1);
}

const tenantsRoot = resolve('tenants');
const tenantDirs = readdirSync(tenantsRoot, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name)
  .filter((name) => existsSync(resolve(tenantsRoot, name, 'tenant.config.json')));

const tenants =
  tenantArg === 'all'
    ? tenantDirs
    : tenantDirs.includes(tenantArg)
    ? [tenantArg]
    : [];

if (tenants.length === 0) {
  console.error(`Unknown tenant "${tenantArg}". Available: ${tenantDirs.join(', ') || 'none'}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

const addError = (tenant, message) => {
  errors.push(`[${tenant}] ${message}`);
};

const addWarning = (tenant, message) => {
  warnings.push(`[${tenant}] ${message}`);
};

const collectBindings = (items, key = 'binding') =>
  Array.isArray(items)
    ? items.map((item) => item?.[key]).filter((binding) => typeof binding === 'string')
    : [];

const validateBindings = (tenant, config, envKey) => {
  const kvBindings = collectBindings(getEffectiveSection(config, envKey, 'kv_namespaces'));
  const d1Bindings = collectBindings(getEffectiveSection(config, envKey, 'd1_databases'));
  const vectorizeBindings = collectBindings(getEffectiveSection(config, envKey, 'vectorize'));
  const durableBindings = collectBindings(
    getEffectiveSection(config, envKey, 'durable_objects')?.bindings,
    'name'
  );
  const aiBinding = getEffectiveSection(config, envKey, 'ai')?.binding;

  for (const binding of REQUIRED_BINDINGS.kv) {
    if (!kvBindings.includes(binding)) {
      addError(tenant, `Missing KV binding "${binding}"`);
    }
  }
  for (const binding of REQUIRED_BINDINGS.d1) {
    if (!d1Bindings.includes(binding)) {
      addError(tenant, `Missing D1 binding "${binding}"`);
    }
  }
  for (const binding of REQUIRED_BINDINGS.vectorize) {
    if (!vectorizeBindings.includes(binding)) {
      addError(tenant, `Missing Vectorize binding "${binding}"`);
    }
  }
  for (const binding of REQUIRED_BINDINGS.durable) {
    if (!durableBindings.includes(binding)) {
      addError(tenant, `Missing Durable Object binding "${binding}"`);
    }
  }
  if (typeof aiBinding !== 'string' || aiBinding.length === 0) {
    addError(tenant, 'Missing AI binding');
  }
};

for (const tenant of tenants) {
  const tenantRoot = resolve(tenantsRoot, tenant);
  const tenantConfigPath = resolve(tenantRoot, 'tenant.config.json');
  const wranglerPath = resolve(tenantRoot, 'wrangler.jsonc');

  if (!existsSync(tenantConfigPath)) {
    addError(tenant, `Missing tenant config: ${tenantConfigPath}`);
    continue;
  }
  if (!existsSync(wranglerPath)) {
    addError(tenant, `Missing wrangler config: ${wranglerPath}`);
    continue;
  }

  let tenantConfig;
  try {
    tenantConfig = JSON.parse(readFileSync(tenantConfigPath, 'utf8'));
  } catch (error) {
    addError(tenant, `Invalid tenant.config.json: ${(error && error.message) || error}`);
    continue;
  }

  const parsedTenant = tenantConfigSchema.safeParse(tenantConfig);
  if (!parsedTenant.success) {
    for (const issue of parsedTenant.error.issues) {
      addError(tenant, `tenant.config.json ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    continue;
  }

  let wranglerConfig;
  try {
    wranglerConfig = loadWranglerConfig(wranglerPath);
  } catch (error) {
    addError(tenant, `Invalid wrangler.jsonc: ${(error && error.message) || error}`);
    continue;
  }

  let envKey = undefined;
  if (envArg) {
    const resolution = resolveEnvKey(wranglerConfig, envArg);
    if (!resolution.envKey) {
      const available = listEnvKeys(wranglerConfig);
      addError(
        tenant,
        `Unknown env "${envArg}". Available: ${available.length ? available.join(', ') : 'none'}`
      );
    } else {
      if (resolution.envKey !== envArg) {
        addWarning(tenant, `Using env "${resolution.envKey}" (resolved from "${envArg}").`);
      }
      envKey = resolution.envKey;
    }
  }

  if (wranglerConfig.account_id && wranglerConfig.account_id !== parsedTenant.data.accountId) {
    addError(
      tenant,
      `account_id mismatch (wrangler: ${wranglerConfig.account_id}, tenant: ${parsedTenant.data.accountId})`
    );
  }

  if (envKey && wranglerConfig.env?.[envKey]?.account_id) {
    const envAccount = wranglerConfig.env[envKey].account_id;
    if (envAccount !== parsedTenant.data.accountId) {
      addError(
        tenant,
        `env.${envKey}.account_id mismatch (wrangler: ${envAccount}, tenant: ${parsedTenant.data.accountId})`
      );
    }
  }

  validateBindings(tenant, wranglerConfig, envKey);
}

if (warnings.length > 0) {
  console.warn('Warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('Config validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Config validation passed for ${tenants.length} tenant(s).`);
