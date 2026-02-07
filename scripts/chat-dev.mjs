import process from 'node:process';
import { TextDecoder } from 'node:util';

const tenantArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const tenant = tenantArg?.split('=')[1];
const messageArg = process.argv.find((arg) => arg.startsWith('--message='));
const message = messageArg?.split('=').slice(1).join('=') ?? 'Hello';
const sessionArg = process.argv.find((arg) => arg.startsWith('--session='));
const sessionId = sessionArg?.split('=')[1] ?? '11111111-1111-1111-1111-111111111111';
const stream = process.argv.includes('--stream');
const hostArg = process.argv.find((arg) => arg.startsWith('--host='));
const host = hostArg?.split('=')[1] ?? '127.0.0.1';
const portArg = process.argv.find((arg) => arg.startsWith('--port='));
const port = portArg?.split('=')[1] ?? '8787';

if (!tenant) {
  console.error(
    'Usage: npm run chat:dev -- --tenant=<tenant-name> [--message=Hello] [--session=<uuid>] [--stream] [--host=127.0.0.1] [--port=8787]'
  );
  process.exit(1);
}

const url = `http://${host}:${port}/chat`;
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-tenant-id': tenant
  },
  body: JSON.stringify({
    sessionId,
    message,
    stream
  })
});

if (!stream) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Chat failed (${response.status})`, body);
    process.exit(1);
  }
  console.log('Chat ok', body);
  process.exit(0);
}

if (!response.body) {
  console.error(`Chat failed (${response.status}) - no response body`);
  process.exit(1);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) {
    break;
  }
  process.stdout.write(decoder.decode(value, { stream: true }));
}
