import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { PolicyInput } from './alerts.schema.js';
@Injectable()
export class AlertsService {
  constructor(private readonly db: PrismaService, private readonly spaces: WorkspacesService) {}
  private async workflow(userId: string, workspaceId: string, workflowId: string, owner = false) {
    await this.spaces.requireMember(userId, workspaceId, owner);
    const workflow = await this.db.client.workflow.findFirst({ where: { id: workflowId, workspaceId } });
    if (!workflow) throw new NotFoundException('Workflow not found.');
    return workflow;
  }
  async policy(userId: string, workspaceId: string, workflowId: string) {
    await this.workflow(userId, workspaceId, workflowId);
    return await this.db.client.alertPolicy.findUnique({ where: { workflowId } }) ?? { workflowId, failureEnabled: false, expectedMinutes: null };
  }
  async savePolicy(userId: string, workspaceId: string, workflowId: string, input: PolicyInput) {
    await this.workflow(userId, workspaceId, workflowId, true);
    return this.db.client.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', 'alerts:' + workflowId);
      const existing = await tx.alertPolicy.findUnique({ where: { workflowId } });
      // Only a changed cadence starts a new missing-run observation period.
      const reset = !existing || existing.expectedMinutes !== input.expectedMinutes;
      const data = { ...input, ...(reset ? { monitoringSince: new Date(), generation: randomUUID() } : {}) };
      return tx.alertPolicy.upsert({ where: { workflowId }, create: { workflowId, ...data }, update: data });
    });
  }
  async list(userId: string, workspaceId: string, page: number) {
    await this.spaces.requireMember(userId, workspaceId);
    const where = { workflow: { workspaceId } };
    return this.db.client.$transaction(async tx => {
      const total = await tx.alert.count({ where });
      const unread = await tx.alert.count({ where: { ...where, delivery: 'DELIVERED', readAt: null } });
      const items = await tx.alert.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, kind: true, message: true, delivery: true, attempts: true, lastError: true, createdAt: true, deliveredAt: true, readAt: true, runId: true, workflow: { select: { id: true, name: true } } } });
      return { items, total, unread, page, totalPages: Math.max(1, Math.ceil(total / 20)) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async markRead(userId: string, workspaceId: string, id: string) {
    await this.spaces.requireMember(userId, workspaceId);
    const row = await this.db.client.alert.findFirst({ where: { id, workflow: { workspaceId }, delivery: 'DELIVERED' } });
    if (!row) throw new NotFoundException('Delivered alert not found.');
    await this.db.client.alert.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } });
    return { read: true };
  }
}
