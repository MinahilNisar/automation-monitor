import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
@Injectable()
export class WorkflowsService {
  constructor(private readonly db: PrismaService, private readonly workspaces: WorkspacesService) {}
  async list(userId: string, workspaceId: string) {
    await this.workspaces.requireMember(userId, workspaceId);
    return this.db.client.workflow.findMany({ where: { workspaceId }, take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: { _count: { select: { runs: true } } } });
  }
  async create(userId: string, workspaceId: string, data: { name: string; slug: string }) {
    await this.workspaces.requireMember(userId, workspaceId);
    try { return await this.db.client.workflow.create({ data: { ...data, workspaceId } }); }
    catch (error) { if ((error as { code?: string }).code === 'P2002') throw new ConflictException('A workflow with this slug already exists in this workspace.'); throw error; }
  }
  async runs(userId: string, workspaceId: string, workflowId: string) {
    await this.workspaces.requireMember(userId, workspaceId);
    const workflow = await this.db.client.workflow.findFirst({ where: { id: workflowId, workspaceId } });
    if (!workflow) throw new NotFoundException('Workflow not found.');
    return this.db.client.run.findMany({ where: { workflowId: workflow.id }, take: 50, orderBy: [{ startedAt: 'desc' }, { id: 'asc' }], include: { events: { take: 100, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } } });
  }
}
