import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const safeKey = { id: true, label: true, createdAt: true, expiresAt: true, revokedAt: true, createdById: true } as const;
@Injectable()
export class ApiKeyService {
  constructor(private readonly db: PrismaService, private readonly workspaces: WorkspacesService) {}
  private async owner(userId: string, workspaceId: string, workflowId: string) {
    await this.workspaces.requireMember(userId, workspaceId, true);
    if (!await this.db.client.workflow.findFirst({ where: { id: workflowId, workspaceId } })) throw new NotFoundException('Workflow not found.');
  }
  async create(userId: string, workspaceId: string, workflowId: string, label: string) {
    await this.owner(userId, workspaceId, workflowId);
    const key = 'amk_' + randomBytes(32).toString('base64url');
    const record = await this.db.client.workflowApiKey.create({ data: { workflowId, createdById: userId, label, keyHash: hashKey(key), expiresAt: new Date(Date.now() + 90 * 86400000) }, select: safeKey });
    return { ...record, key };
  }
  async list(userId: string, workspaceId: string, workflowId: string) {
    await this.owner(userId, workspaceId, workflowId);
    return this.db.client.workflowApiKey.findMany({ where: { workflowId }, select: safeKey, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async revoke(userId: string, workspaceId: string, workflowId: string, id: string) {
    await this.owner(userId, workspaceId, workflowId);
    const record = await this.db.client.workflowApiKey.findFirst({ where: { id, workflowId } });
    if (!record) throw new NotFoundException('Key not found.');
    // Updating the row synchronizes with the ingestion transaction's shared lock.
    await this.db.client.workflowApiKey.updateMany({ where: { id, workflowId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  async authenticate(header: string | undefined, workflowId: string) {
    const match = header?.match(/^Bearer (amk_[A-Za-z0-9_-]{43})$/);
    if (!match) throw new UnauthorizedException('A valid workflow API key is required.');
    const record = await this.db.client.workflowApiKey.findUnique({ where: { keyHash: hashKey(match[1]) } });
    if (!record || record.workflowId !== workflowId || record.revokedAt || record.expiresAt <= new Date()) throw new UnauthorizedException('A valid workflow API key is required.');
    return { id: record.id, workflowId: record.workflowId };
  }
}
