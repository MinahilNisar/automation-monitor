import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import type { MonitorFilter } from './monitor.schema.js';
type DailyRow = { day: string; status: 'RUNNING' | 'SUCCEEDED' | 'FAILED'; count: number };
@Injectable()
export class MonitorService {
  constructor(private readonly db: PrismaService, private readonly workspaces: WorkspacesService) {}
  async overview(userId: string, workspaceId: string, filter: MonitorFilter) {
    await this.workspaces.requireMember(userId, workspaceId);
    if (filter.workflowId && !await this.db.client.workflow.findFirst({ where: { id: filter.workflowId, workspaceId } })) throw new NotFoundException('Workflow not found.');
    const from = new Date(filter.from + 'T00:00:00.000Z');
    const until = new Date(Date.parse(filter.to + 'T00:00:00.000Z') + 86400000);
    const where: Prisma.RunWhereInput = { workflow: { workspaceId }, createdAt: { gte: from, lt: until }, ...(filter.workflowId ? { workflowId: filter.workflowId } : {}), ...(filter.status ? { status: filter.status } : {}) };
    // One snapshot keeps totals, chart and the current page consistent during ingestion.
    return this.db.client.$transaction(async tx => {
      const groups = await tx.run.groupBy({ by: ['status'], where, _count: { _all: true } });
      const counts = { RUNNING: 0, SUCCEEDED: 0, FAILED: 0 };
      for (const row of groups) counts[row.status] = row._count._all;
      const total = counts.RUNNING + counts.SUCCEEDED + counts.FAILED;
      const finished = counts.SUCCEEDED + counts.FAILED;
      const items = await tx.run.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (filter.page - 1) * 20, take: 20, include: { workflow: { select: { id: true, name: true, slug: true } } } });
      // Parameterized SQL aggregates in PostgreSQL instead of loading every run into Node.
      const rows = await tx.$queryRaw<DailyRow[]>(Prisma.sql`
        SELECT to_char(r."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
          r.status, count(*)::int AS count
        FROM "Run" r JOIN "Workflow" w ON w.id = r."workflowId"
        WHERE w."workspaceId" = ${workspaceId}::uuid
          AND r."createdAt" >= ${from} AND r."createdAt" < ${until}
          ${filter.workflowId ? Prisma.sql`AND r."workflowId" = ${filter.workflowId}::uuid` : Prisma.empty}
          ${filter.status ? Prisma.sql`AND r.status = ${filter.status}::"RunStatus"` : Prisma.empty}
        GROUP BY day, r.status ORDER BY day`);
      const daily = [];
      for (let time = from.getTime(); time < until.getTime(); time += 86400000) {
        const day = new Date(time).toISOString().slice(0, 10);
        const point = { day, RUNNING: 0, SUCCEEDED: 0, FAILED: 0 };
        for (const row of rows) if (row.day === day) point[row.status] = row.count;
        daily.push(point);
      }
      return { summary: { total, running: counts.RUNNING, succeeded: counts.SUCCEEDED, failed: counts.FAILED, successRate: finished ? Math.round(counts.SUCCEEDED / finished * 1000) / 10 : null }, daily, items, page: filter.page, pageSize: 20, totalPages: Math.ceil(total / 20) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async detail(userId: string, workspaceId: string, id: string, page: number) {
    await this.workspaces.requireMember(userId, workspaceId);
    return this.db.client.$transaction(async tx => {
      const run = await tx.run.findFirst({ where: { id, workflow: { workspaceId } }, include: { workflow: { select: { id: true, name: true, slug: true } } } });
      if (!run) throw new NotFoundException('Run not found.');
      const totalEvents = await tx.runEvent.count({ where: { runId: id } });
      const events = await tx.runEvent.findMany({ where: { runId: id }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50 });
      return { run, events, totalEvents, page, totalPages: Math.ceil(totalEvents / 50) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async workflows(userId: string, workspaceId: string, cursor?: string) {
    await this.workspaces.requireMember(userId, workspaceId);
    const rows = await this.db.client.workflow.findMany({ where: { workspaceId, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 101, select: { id: true, name: true } });
    const items = rows.slice(0, 100);
    return { items, nextCursor: rows.length > 100 ? items[99].id : null };
  }
}
