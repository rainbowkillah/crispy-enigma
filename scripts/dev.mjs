import { spawn } from 'node:child_process';
import process from 'node:process';

const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenant = tenantArg?.split('=')[1];

if (!tenant) {
  console.error('Usage: pnpm dev --tenant=<tenant-name>');
  process.exit(1);
}

const configPath = `tenants/${tenant}/wrangler.jsonc`;

const child = spawn('wrangler', ['dev', '--config', configPath], {
  stdio: 'inherit'
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
