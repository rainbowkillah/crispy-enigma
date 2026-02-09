import process from 'node:process';

const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenant = tenantArg?.split('=')[1];
const hostArg = process.argv.find((arg) => arg.startsWith('--host='));
const host = hostArg?.split('=')[1] ?? '127.0.0.1';
const schemeArg = process.argv.find((arg) => arg.startsWith('--scheme='));
const scheme = schemeArg?.split('=')[1];
const portArg = process.argv.find((arg) => arg.startsWith('--port='));
const port = portArg?.split('=')[1];

if (!tenant) {
  console.error(
    'Usage: npm run smoke:dev -- --tenant=<tenant-name> [--host=127.0.0.1] [--port=8787] [--scheme=http|https]'
  );
  process.exit(1);
}

const isLocalHost =
  host === '127.0.0.1' ||
  host === 'localhost' ||
  host === '0.0.0.0';
const resolvedScheme = scheme ?? (isLocalHost ? 'http' : 'https');
const resolvedPort = port ?? (resolvedScheme === 'https' ? '443' : '8787');

const url = `${resolvedScheme}://${host}:${resolvedPort}/health`;

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
