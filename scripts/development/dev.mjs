import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadWranglerConfig, listEnvKeys, resolveEnvKey } from '../lib/wrangler-config.mjs';

const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenant = tenantArg?.split('=')[1];
const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const env = envArg?.split('=')[1];
const useLocal = process.argv.includes('--local') || process.env.CI === 'true';

if (!tenant) {
  console.error('Usage: npm run dev -- --tenant=<tenant-name>');
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

const args = ['dev', '--config', configPath];
if (resolvedEnv) {
  args.push('--env', resolvedEnv);
}
if (useLocal) {
  args.push('--local');
  args.push('--ip', '127.0.0.1');
}

const child = spawn('wrangler', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: wranglerLogPath,
    WRANGLER_NO_LOCALHOST_PROXY: 'true'
  }
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
