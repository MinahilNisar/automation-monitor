import { Queue, Worker } from 'bullmq';
import type { PrismaClient } from '../generated/prisma/client.js';

export function redisConnection() {
  const port = Number(process.env.REDIS_PORT ?? 6380);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid REDIS_PORT');
  return { host: process.env.REDIS_HOST ?? '127.0.0.1', port, connectTimeout: 3000, maxRetriesPerRequest: 1, enableOfflineQueue: false };
}

// The database row is both the durable outbox and the eventual inbox item.
// Queue payloads contain only an opaque ID; never event logs or credentials.
export class AlertsEngine {
  readonly queue: Queue;
  private policyCursor?: string;
  private pendingCursor?: string;
  constructor(private readonly db: PrismaClient, readonly queueName = 'automation-alerts', private readonly workflowIds?: string[]) {
    this.queue = new Queue(queueName, { connection: redisConnection(), defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: false } });
    this.queue.on('error', () => console.error('Alert queue unavailable; pending alerts remain in PostgreSQL.'));
  }
  async scanMissing(now = new Date()) {
    const policies = await this.db.alertPolicy.findMany({ where: { ...(this.workflowIds ? { workflowId: { in: this.workflowIds } } : {}), expectedMinutes: { not: null }, ...(this.policyCursor ? { AND: { workflowId: { gt: this.policyCursor } } } : {}) }, orderBy: { workflowId: 'asc' }, take: 100, select: { workflowId: true } });
    for (const { workflowId } of policies) {
      await this.db.$transaction(async tx => {
        // Same lock as ingestion and rule editing: inspect one coherent workflow state.
        await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', 'alerts:' + workflowId);
        const policy = await tx.alertPolicy.findUnique({ where: { workflowId } });
        if (!policy?.expectedMinutes) return;
        const latest = await tx.run.findFirst({ where: { workflowId, createdAt: { gte: policy.monitoringSince } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, createdAt: true } });
        const lastReceived = latest?.createdAt ?? policy.monitoringSince;
        if (now.getTime() < lastReceived.getTime() + policy.expectedMinutes * 60000) return;
        await tx.alert.createMany({ data: [{ workflowId, kind: 'MISSING_RUN', dedupeKey: 'missing:' + policy.generation + ':' + (latest?.id ?? 'initial'), message: 'No new run reached the monitor within ' + policy.expectedMinutes + ' minutes of the observation baseline.' }], skipDuplicates: true });
      });
    }
    this.policyCursor = policies.length === 100 ? policies.at(-1)!.workflowId : undefined;
  }
  async dispatch() {
    const rows = await this.db.alert.findMany({ where: { ...(this.workflowIds ? { workflowId: { in: this.workflowIds } } : {}), delivery: 'PENDING', ...(this.pendingCursor ? { id: { gt: this.pendingCursor } } : {}) }, orderBy: { id: 'asc' }, take: 100, select: { id: true } });
    for (const row of rows) {
      const existing = await this.queue.getJob(row.id);
      if (existing && await existing.getState() === 'failed') {
        await this.db.alert.updateMany({ where: { id: row.id, delivery: 'PENDING' }, data: { delivery: 'FAILED', attempts: existing.attemptsMade, lastError: 'Background delivery exhausted its retry budget. Inspect the worker.' } });
      } else {
        await this.queue.add('publish-inbox', { alertId: row.id }, { jobId: row.id });
      }
    }
    this.pendingCursor = rows.length === 100 ? rows.at(-1)!.id : undefined;
  }
  async deliver(alertId: string, attempt: number) {
    // Atomic idempotency boundary: repeated/stalled jobs cannot publish twice or reset read status.
    await this.db.alert.updateMany({ where: { id: alertId, delivery: 'PENDING' }, data: { delivery: 'DELIVERED', deliveredAt: new Date(), attempts: attempt, lastError: null } });
  }
  createWorker(deliver = (id: string, attempt: number) => this.deliver(id, attempt)) {
    const worker = new Worker(this.queueName, async job => { await deliver(String(job.data.alertId), job.attemptsMade + 1); }, { connection: { ...redisConnection(), maxRetriesPerRequest: null, enableOfflineQueue: true }, concurrency: 5 });
    worker.on('error', () => console.error('Alert worker connection unavailable; retrying.'));
    worker.on('failed', (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        void this.db.alert.updateMany({ where: { id: String(job.data.alertId), delivery: 'PENDING' }, data: { delivery: 'FAILED', attempts: job.attemptsMade, lastError: 'Background delivery exhausted its retry budget. Inspect the worker.' } }).catch(() => console.error('Alert failure state will be reconciled on the next scan.'));
      }
    });
    return worker;
  }
  async close() { await this.queue.close(); }
}
