import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const safeUser = { id: true, email: true, name: true } as const;
@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService) {}
  async register(data: { email: string; password: string; name: string; workspaceName: string }) {
    const passwordHash = await hashPassword(data.password);
    try {
      return await this.db.client.user.create({
        data: { email: data.email, name: data.name, passwordHash,
          memberships: { create: { role: 'OWNER', workspace: { create: { name: data.workspaceName } } } } },
        select: safeUser,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Unable to create an account with those details.');
      throw error;
    }
  }
  async login(email: string, password: string) {
    const user = await this.db.client.user.findUnique({ where: { email } });
    const valid = await verifyPassword(password, user?.passwordHash);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password.');
    return { id: user.id, name: user.name, email: user.email };
  }
  async issue(userId: string, previous?: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.client.$transaction(async tx => {
      if (typeof previous === 'string') await tx.session.deleteMany({ where: { tokenHash: tokenHash(previous) } });
      await tx.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
      await tx.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } });
    });
    return { token, expiresAt };
  }
  async resolve(token?: string) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Sign in to continue.');
    const session = await this.db.client.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: safeUser } } });
    if (!session || session.expiresAt <= new Date()) throw new UnauthorizedException('Session expired. Sign in again.');
    return session.user;
  }
  async logout(token?: string) { if (typeof token === 'string') await this.db.client.session.deleteMany({ where: { tokenHash: tokenHash(token) } }); }
}
