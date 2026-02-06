import process from 'node:process';

const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenant = tenantArg?.split('=')[1];
const hostArg = process.argv.find((arg) => arg.startsWith('--host='));
const host = hostArg?.split('=')[1] ?? '127.0.0.1';
const portArg = process.argv.find((arg) => arg.startsWith('--port='));
const port = portArg?.split('=')[1] ?? '8787';

if (!tenant) {
  console.error(
    'Usage: npm run smoke:dev -- --tenant=<tenant-name> [--host=127.0.0.1] [--port=8787]'
  );
  process.exit(1);
}

const url = `http://${host}:${port}/health`;

const response = await fetch(url, {
  headers: {
    'x-tenant-id': tenant
  }
});

const body = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(`Smoke failed (${response.status})`, body);
  process.exit(1);
}

console.log(`Smoke ok for ${tenant}`, body);
