import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Local demo checks are disabled in production.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 }) });
try {
  const workflow = await db.workflow.findUniqueOrThrow({ where: { workspaceId_slug: { workspaceId: '00000000-0000-4000-8000-000000000003', slug: 'demo-daily-report' } }, include: { runs: { where: { externalId: 'demo-run-001' }, include: { events: true } } } });
  assert.equal(workflow.runs.length, 1);
  const run = workflow.runs[0];
  assert.equal(run.events.length, 2);
  assert.equal(run.status, 'SUCCEEDED');
  await assert.rejects(db.run.create({ data: { workflowId: workflow.id, externalId: run.externalId, status: 'RUNNING', startedAt: new Date() } }), { code: 'P2002' });
  await assert.rejects(db.run.create({ data: { workflowId: '00000000-0000-4000-8000-000000000001', externalId: 'invalid-parent-test', status: 'RUNNING', startedAt: new Date() } }), { code: 'P2003' });
  await assert.rejects(db.$transaction(async tx => {
    await tx.workflow.update({ where: { id: workflow.id }, data: { description: 'Temporary rollback check' } });
    throw new Error('EXPECTED_ROLLBACK');
  }), /EXPECTED_ROLLBACK/);
  assert.equal((await db.workflow.findUniqueOrThrow({ where: { id: workflow.id } })).description, workflow.description);
  console.log(JSON.stringify({ workflowId: workflow.id, runId: run.id, events: run.events.length, constraints: 'passed', rollback: 'passed' }));
} finally { await db.$disconnect(); }
