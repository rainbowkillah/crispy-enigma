import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  listEnvKeys,
  loadWranglerConfig,
  resolveEnvKey
} from './lib/wrangler-config.mjs';

const tokenForTenant = (name) => {
  const normalized = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return (
    process.env[`CLOUDFLARE_API_TOKEN_${normalized}`] ??
    process.env.CLOUDFLARE_API_TOKEN ??
    null
  );
};

const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenant = tenantArg?.split('=')[1];
const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const env = envArg?.split('=')[1];

if (!tenant) {
  console.error('Usage: npm run deploy -- --tenant=<tenant-name> [--env=<env>]');
  process.exit(1);
}

const tenantRoot = resolve(`tenants/${tenant}`);
const configPath = resolve(`${tenantRoot}/wrangler.jsonc`);
const wranglerLogPath = resolve(`${tenantRoot}/.wrangler/logs`);

const generate = spawnSync('node', ['scripts/generate-tenant-index.mjs'], {
  stdio: 'inherit'
});
if (generate.status !== 0) {
  process.exit(generate.status ?? 1);
}

if (!existsSync(configPath)) {
  console.error(`Missing wrangler config: ${configPath}`);
  process.exit(1);
}

const validateArgs = ['scripts/validate-config.mjs', `--tenant=${tenant}`, '--remote'];
if (env) {
  validateArgs.push(`--env=${env}`);
}
const validate = spawnSync('node', validateArgs, { stdio: 'inherit' });
if (validate.status !== 0) {
  process.exit(validate.status ?? 1);
}

const wranglerConfig = loadWranglerConfig(configPath);
let resolvedEnv = env;
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
  resolvedEnv = resolution.envKey;
}

mkdirSync(wranglerLogPath, { recursive: true });

const args = ['deploy', '--config', configPath];
if (resolvedEnv) {
  args.push('--env', resolvedEnv);
}

const startedAt = new Date().toISOString();
const output = [];
const token = tokenForTenant(tenant);

const child = spawn('wrangler', args, {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ...(token ? { CLOUDFLARE_API_TOKEN: token } : {}),
    WRANGLER_LOG_PATH: wranglerLogPath
  }
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  output.push(chunk.toString());
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  output.push(chunk.toString());
});

child.on('exit', (code) => {
  const finishedAt = new Date().toISOString();
  const safeTimestamp = startedAt.replace(/[:.]/g, '-');
  const deploymentDir = resolve('deployments');
  mkdirSync(deploymentDir, { recursive: true });
  let gitSha = null;
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (git.status === 0) {
    gitSha = git.stdout.trim();
  }

  const log = {
    tenant,
    env: resolvedEnv ?? 'base',
    accountId: wranglerConfig.account_id ?? null,
    configPath,
    command: {
      bin: 'wrangler',
      args
    },
    startedAt,
    finishedAt,
    exitCode: code ?? 1,
    success: (code ?? 1) === 0,
    gitSha,
    output: output.join('')
  };

  const logPath = resolve(
    deploymentDir,
    `${tenant}-${resolvedEnv ?? 'base'}-${safeTimestamp}.json`
  );
  writeFileSync(logPath, JSON.stringify(log, null, 2));

  process.exit(code ?? 1);
});
