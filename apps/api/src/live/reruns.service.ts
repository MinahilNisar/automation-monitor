import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { RerunAdapter } from './rerun-adapter.js';
import { replayInputSchema } from './reruns.schema.js';
@Injectable()
export class RerunsService {
  constructor(private readonly db: PrismaService, private readonly spaces: WorkspacesService, private readonly adapter: RerunAdapter) {}
  private async run(userId: string, workspaceId: string, runId: string, owner = false) {
    await this.spaces.requireMember(userId, workspaceId, owner);
    const run = await this.db.client.run.findFirst({ where: { id: runId, workflow: { workspaceId } } });
    if (!run) throw new NotFoundException('Run not found.');
    return run;
  }
  async overview(userId: string, workspaceId: string, runId: string) {
    const run = await this.run(userId, workspaceId, runId);
    const member = await this.spaces.requireMember(userId, workspaceId);
    const audit = await this.db.client.rerunRequest.findUnique({ where: { sourceRunId: runId } });
    const replay = replayInputSchema.safeParse(run.replayInput);
    const connected = !!await this.adapter.connection(run.workflowId);
    const result = audit?.resultRunId ? await this.db.client.run.findFirst({ where: { id: audit.resultRunId, workflowId: run.workflowId }, select: { id: true, status: true, externalId: true } }) : null;
    const reason = member.role !== 'OWNER' ? 'Only workspace owners can request a rerun.' : audit ? 'A rerun has already been requested for this run.' : run.status !== 'FAILED' ? 'Only failed runs can be rerun.' : !replay.success ? 'This run has no supported saved input. Older runs are view-only.' : !connected ? 'The Phase 8 order integration is not connected for this workflow.' : null;
    return { eligible: reason === null, reason, input: replay.success ? replay.data : null, audit: audit ? { ...audit, status: audit.status === 'REQUESTED' && audit.createdAt.getTime() < Date.now() - 30000 ? 'UNCERTAIN' : audit.status, result } : null };
  }
  async request(userId: string, userName: string, workspaceId: string, runId: string, requestId: string) {
    const run = await this.run(userId, workspaceId, runId, true);
    const connection = await this.adapter.connection(run.workflowId);
    const input = replayInputSchema.safeParse(run.replayInput);
    const accepted = await this.db.client.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', 'rerun-request:' + requestId);
      await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', 'rerun:' + runId);
      const prior = await tx.rerunRequest.findUnique({ where: { sourceRunId: runId } });
      if (prior) return { created: false, audit: prior };
      if (await tx.rerunRequest.findUnique({ where: { id: requestId } })) throw new ConflictException('Request ID is already in use.');
      if (run.status !== 'FAILED' || !input.success || !connection) throw new ConflictException('This run is not eligible for a supported rerun.');
      const audit = await tx.rerunRequest.create({ data: { id: requestId, workflowId: run.workflowId, sourceRunId: runId, requestedById: userId, requestedByName: userName } });
      return { created: true, audit };
    });
    if (accepted.created && connection && input.success) {
      // One outbound attempt. Never automatically retry a possibly accepted external action.
      const outcome = await this.adapter.send(connection, input.data, accepted.audit.id);
      await this.db.client.rerunRequest.updateMany({ where: { id: accepted.audit.id, status: 'REQUESTED' }, data: { status: outcome } });
    }
    return this.overview(userId, workspaceId, runId);
  }
}
