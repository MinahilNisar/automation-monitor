import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
if (!process.env.DATABASE_URL) throw new Error('Run npm run setup:env at the project root.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  await db.$transaction(async tx => {
    const workflow = await tx.workflow.upsert({
      where: { slug: 'demo-daily-report' }, update: {},
      create: { slug: 'demo-daily-report', name: '[DEMO] Daily sales report', description: 'Synthetic Phase 2 data, not a connected automation.' },
    });
    const run = await tx.run.upsert({
      where: { workflowId_externalId: { workflowId: workflow.id, externalId: 'demo-run-001' } }, update: {},
      create: { workflowId: workflow.id, externalId: 'demo-run-001', status: 'SUCCEEDED', startedAt: new Date('2026-01-01T09:00:00Z'), finishedAt: new Date('2026-01-01T09:00:05Z') },
    });
    for (const event of [
      { externalId: 'demo-start', type: 'STARTED' as const, message: 'Synthetic report started.', occurredAt: new Date('2026-01-01T09:00:00Z') },
      { externalId: 'demo-end', type: 'COMPLETED' as const, message: 'Synthetic report completed.', occurredAt: new Date('2026-01-01T09:00:05Z') },
    ]) await tx.runEvent.upsert({ where: { runId_externalId: { runId: run.id, externalId: event.externalId } }, update: {}, create: { runId: run.id, ...event } });
  });
  console.log('Demo data ready: one workflow, one run, two events. Rerunning does not duplicate them.');
} finally { await db.$disconnect(); }
