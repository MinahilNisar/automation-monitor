import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
@Injectable()
export class WorkspacesService {
  constructor(private readonly db: PrismaService) {}
  async requireMember(userId: string, workspaceId: string, owner = false) {
    const membership = await this.db.client.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
    if (!membership) throw new NotFoundException('Workspace not found.');
    if (owner && membership.role !== 'OWNER') throw new ForbiddenException('Only owners can manage members.');
    return membership;
  }
  list(userId: string) { return this.db.client.membership.findMany({ where: { userId }, include: { workspace: true }, orderBy: { workspaceId: 'asc' } }); }
  create(userId: string, name: string) { return this.db.client.workspace.create({ data: { name, memberships: { create: { userId, role: 'OWNER' } } } }); }
  async members(userId: string, workspaceId: string) {
    await this.requireMember(userId, workspaceId);
    return this.db.client.membership.findMany({ where: { workspaceId }, select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { userId: 'asc' } });
  }
  async addMember(userId: string, workspaceId: string, email: string) {
    await this.requireMember(userId, workspaceId, true);
    const user = await this.db.client.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('That user must register before being added.');
    try { return await this.db.client.membership.create({ data: { userId: user.id, workspaceId, role: 'MEMBER' }, select: { userId: true, role: true } }); }
    catch (error) { if ((error as { code?: string }).code === 'P2002') throw new ConflictException('User is already a member.'); throw error; }
  }
  async removeMember(userId: string, workspaceId: string, targetId: string) {
    await this.requireMember(userId, workspaceId, true);
    const result = await this.db.client.membership.deleteMany({ where: { workspaceId, userId: targetId, role: 'MEMBER' } });
    if (!result.count) throw new NotFoundException('Member not found or is an owner.');
  }
}
