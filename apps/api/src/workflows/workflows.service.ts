import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    try {
      return await this.prisma.client.workflow.findMany({
        take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: { _count: { select: { runs: true } } },
      });
    } catch { throw new ServiceUnavailableException('Database unavailable. Check startup and migrations.'); }
  }

  async runs(workflowId: string) {
    try {
      const workflow = await this.prisma.client.workflow.findUnique({ where: { id: workflowId } });
      if (!workflow) throw new NotFoundException('Workflow not found.');
      return await this.prisma.client.run.findMany({
        where: { workflowId }, take: 50,
        orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
        include: { events: { take: 100, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException('Database unavailable. Check startup and migrations.');
    }
  }
}
