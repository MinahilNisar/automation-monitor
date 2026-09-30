import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { IngestEvent } from './event.schema.js';
import { nextRunState } from './run-state.js';
@Injectable()
export class IngestionService {
  constructor(private readonly db: PrismaService) {}
  async accept(key: { id: string; workflowId: string }, input: IngestEvent) {
    return this.db.client.$transaction(async tx => {
      // Fixed SQL with bound parameters: no request values are concatenated into SQL.
      // Hold a shared key lock so revocation and in-flight acceptance have a clear order.
      await tx.$queryRawUnsafe('SELECT "id" FROM "WorkflowApiKey" WHERE "id" = $1::uuid FOR SHARE', key.id);
      const active = await tx.workflowApiKey.findUnique({ where: { id: key.id } });
      if (!active || active.workflowId !== key.workflowId || active.revokedAt || active.expiresAt <= new Date()) throw new UnauthorizedException('A valid workflow API key is required.');
      await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', 'alerts:' + key.workflowId);
      // Serialize deliveries for this run across all API processes and all its keys.
      await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', key.workflowId + ':' + input.runId);
      const existing = await tx.run.findUnique({ where: { workflowId_externalId: { workflowId: key.workflowId, externalId: input.runId } } });
      if (existing) {
        const event = await tx.runEvent.findUnique({ where: { runId_externalId: { runId: existing.id, externalId: input.eventId } } });
        if (event) {
          if (event.type !== input.type || event.message !== input.message || event.occurredAt.getTime() !== Date.parse(input.occurredAt)) throw new ConflictException('This event ID was already used with a different payload.');
          return { duplicate: true, run: existing, event };
        }
      }
      const state = nextRunState(existing, input);
      const run = existing
        ? await tx.run.update({ where: { id: existing.id }, data: state })
        : await tx.run.create({ data: { workflowId: key.workflowId, externalId: input.runId, ...state } });
      const event = await tx.runEvent.create({ data: { runId: run.id, externalId: input.eventId, type: input.type, occurredAt: new Date(input.occurredAt), message: input.message } });
      if (input.type === 'FAILED' && existing?.status !== 'FAILED') {
        const policy = await tx.alertPolicy.findUnique({ where: { workflowId: key.workflowId } });
        if (policy?.failureEnabled) await tx.alert.createMany({ data: [{ workflowId: key.workflowId, runId: run.id, kind: 'FAILURE', dedupeKey: 'failure:' + run.id, message: 'An automation run reported a failure. Review its event timeline.' }], skipDuplicates: true });
      }
      return { duplicate: false, run, event };
    }, { maxWait: 5000, timeout: 10000 });
  }
}
