import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { AiProvider } from './ai.provider.js';
import { evidence, POLICY, validateReport } from './evidence.js';
@Injectable()
export class AiService {
  constructor(private readonly db: PrismaService, private readonly workspaces: WorkspacesService, private readonly provider: AiProvider) {}
  async preview(userId: string, workspaceId: string, runId: string) {
    const membership = await this.workspaces.requireMember(userId, workspaceId);
    const snapshot = await this.db.client.$transaction(async tx => {
      const run = await tx.run.findFirst({ where: { id: runId, workflow: { workspaceId } }, select: { status: true } });
      if (!run) throw new NotFoundException('Run not found.');
      const rows = await tx.runEvent.findMany({ where: { runId }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 12, select: { type: true, occurredAt: true, message: true } });
      return { status: run.status, ...evidence(rows.reverse(), await tx.runEvent.count({ where: { runId } })) };
    }, { isolationLevel: 'RepeatableRead' });
    const report = await this.db.client.aiReport.findUnique({ where: { runId_evidenceHash: { runId, evidenceHash: snapshot.hash } } });
    return { ...snapshot, configured: this.provider.configured(), canGenerate: membership.role === 'OWNER' && snapshot.status === 'FAILED', report: report ? { ...report, status: report.status === 'PENDING' && Date.now() - report.createdAt.getTime() > 60000 ? 'INTERRUPTED' : report.status } : null };
  }
  async generate(userId: string, workspaceId: string, runId: string, hash: string) {
    const member = await this.workspaces.requireMember(userId, workspaceId);
    if (member.role !== 'OWNER') throw new ForbiddenException('Only owners can send evidence to AI.');
    const preview = await this.preview(userId, workspaceId, runId);
    if (preview.status !== 'FAILED') throw new BadRequestException('Only failed runs can be reviewed.');
    if (preview.hash !== hash) throw new ConflictException('Evidence changed. Review the new preview first.');
    if (preview.report) return preview;
    if (!this.provider.configured()) throw new ServiceUnavailableException('AI is not configured.');
    const claim = await this.db.client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ 'ai:' + workspaceId }))`;
      const existing = await tx.aiReport.findUnique({ where: { runId_evidenceHash: { runId, evidenceHash: hash } } });
      if (existing) return null;
      const count = await tx.aiReport.count({ where: { run: { workflow: { workspaceId } }, createdAt: { gte: new Date(Date.now() - 86400000) } } });
      if (count >= 20) throw new HttpException('Workspace limit: 20 AI requests in 24 hours.', 429);
      return tx.aiReport.create({ data: { runId, evidenceHash: hash, model: this.provider.model(), policy: POLICY, requestedById: userId, evidence: preview.input } });
    });
    if (claim) {
      try {
        const result = validateReport(await this.provider.generate(preview.input), preview.input);
        await this.db.client.aiReport.update({ where: { id: claim.id }, data: { status: 'COMPLETE', result } });
      } catch {
        await this.db.client.aiReport.update({ where: { id: claim.id }, data: { status: 'FAILED' } });
      }
    }
    return this.preview(userId, workspaceId, runId);
  }
}
