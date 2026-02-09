import { open } from 'node:fs/promises';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const TENANT_ID = process.env.TENANT_ID || 'mrrainbowsmoke';
const API_KEY = process.env.API_KEY || 'test-api-key';
const RPS = Number(process.env.RPS) || 5;
const DURATION_SEC = Number(process.env.DURATION) || 10;

interface RequestResult {
  endpoint: string;
  status: number;
  latencyMs: number;
  success: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runTest() {
  console.log(`Starting load test against ${BASE_URL} for tenant ${TENANT_ID}`);
  console.log(`Target RPS: ${RPS}, Duration: ${DURATION_SEC}s`);

  const results: RequestResult[] = [];
  const start = Date.now();
  const end = start + DURATION_SEC * 1000;

  let requestCount = 0;

  while (Date.now() < end) {
    const batchStart = Date.now();
    const promises: Promise<RequestResult>[] = [];

    for (let i = 0; i < RPS; i++) {
      if (Date.now() >= end) break;
      const endpoint = i % 2 === 0 ? '/chat' : '/search';
      promises.push(makeRequest(endpoint));
      requestCount++;
    }

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    const elapsed = Date.now() - batchStart;
    const wait = Math.max(0, 1000 - elapsed);
    if (wait > 0) await sleep(wait);
  }

  printReport(results);
}

async function makeRequest(endpoint: string): Promise<RequestResult> {
  const start = performance.now();
  let status = 0;
  let success = false;

  try {
    const body = endpoint === '/chat' 
      ? { message: 'Hello load test', sessionId: `load-${Date.now()}` }
      : { query: 'test query' };

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': TENANT_ID,
        'authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(body)
    });
    status = res.status;
    success = res.ok;
    // Consume body
    await res.text();
  } catch (err) {
    status = 0;
    success = false;
  }

  const latencyMs = performance.now() - start;
  return { endpoint, status, latencyMs, success };
}

function printReport(results: RequestResult[]) {
  console.log('\n--- Load Test Report ---');
  console.log(`Total Requests: ${results.length}`);
  
  const byEndpoint = results.reduce((acc, r) => {
    if (!acc[r.endpoint]) acc[r.endpoint] = [];
    acc[r.endpoint].push(r);
    return acc;
  }, {} as Record<string, RequestResult[]>);

  for (const [endpoint, reqs] of Object.entries(byEndpoint)) {
    const successCount = reqs.filter(r => r.success).length;
    const errorCount = reqs.length - successCount;
    const latencies = reqs.map(r => r.latencyMs).sort((a, b) => a - b);
    
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const max = latencies[latencies.length - 1] || 0;

    console.log(`
Endpoint: ${endpoint}`);
    console.log(`  Requests: ${reqs.length}`);
    console.log(`  Success Rate: ${((successCount / reqs.length) * 100).toFixed(2)}%`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Latency (ms): p50=${p50.toFixed(0)}, p95=${p95.toFixed(0)}, p99=${p99.toFixed(0)}, max=${max.toFixed(0)}`);
  }
}

runTest().catch(console.error);
