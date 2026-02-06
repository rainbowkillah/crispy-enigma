import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenant = tenantArg?.split('=')[1];
const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const env = envArg?.split('=')[1];

if (!tenant) {
  console.error('Usage: pnpm dev --tenant=<tenant-name>');
  process.exit(1);
}

const configPath = resolve(`tenants/${tenant}/wrangler.jsonc`);

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

const args = ['dev', '--config', configPath];
if (env) {
  args.push('--env', env);
}

const child = spawn('wrangler', args, {
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
