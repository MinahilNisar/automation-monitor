import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Local checks are disabled in production.');
process.env.ENABLE_DEV_ROUTES = 'true';
async function readDemo() {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const response = await fetch(base + '/dev/workflows');
    assert.equal(response.status, 200);
    const workflow = (await response.json()).find(row => row.slug === 'demo-daily-report');
    assert.ok(workflow, 'Seed the demo workflow before running this check.');
    const runsResponse = await fetch(base + '/dev/workflows/' + workflow.id + '/runs');
    assert.equal(runsResponse.status, 200);
    const run = (await runsResponse.json()).find(row => row.externalId === 'demo-run-001');
    assert.ok(run);
    assert.equal(run.events.length, 2);
    assert.equal((await fetch(base + '/dev/workflows/00000000-0000-4000-8000-000000000002/runs')).status, 404);
    return { workflowId: workflow.id, runId: run.id };
  } finally { await app.close(); }
}
const before = await readDemo();
const after = await readDemo();
assert.deepEqual(after, before);
console.log(JSON.stringify({ ...after, httpReads: 'passed', apiRestart: 'passed' }));
