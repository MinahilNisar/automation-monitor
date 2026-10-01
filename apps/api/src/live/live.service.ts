import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../database/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
@Injectable()
export class LiveService {
  private readonly connections = new Map<string, number>();
  constructor(private readonly db: PrismaService, private readonly auth: AuthService, private readonly spaces: WorkspacesService) {}
  async open(userId: string, workspaceId: string, token: string) {
    await this.spaces.requireMember(userId, workspaceId);
    if ((this.connections.get(userId) ?? 0) >= 6) throw new HttpException('Too many live connections.', 429);
    return new Observable<MessageEvent>(subscriber => {
      this.connections.set(userId, (this.connections.get(userId) ?? 0) + 1);
      let closed = false, busy = false, revision: string | undefined;
      const tick = async () => {
        if (closed || busy) return;
        busy = true;
        try {
          const user = await this.auth.resolve(token);
          if (user.id !== userId) throw new UnauthorizedException();
          await this.spaces.requireMember(userId, workspaceId);
          const row = await this.db.client.workspaceRevision.findUnique({ where: { workspaceId } });
          if (closed) return;
          const current = String(row?.revision ?? 0);
          if (current !== revision) {
            // Reconnect always sends a snapshot signal, even when Last-Event-ID matches.
            subscriber.next({ type: 'refresh', id: current, retry: 3000, data: { revision: current } });
            revision = current;
          }
        } catch (error) {
          if (!closed) {
            const denied = error instanceof HttpException && [401, 403, 404].includes(error.getStatus());
            subscriber.next({ type: denied ? 'access-ended' : 'reconnect', data: {} });
            subscriber.complete();
          }
        } finally { busy = false; }
      };
      const poll = setInterval(() => { void tick(); }, 2000);
      const heartbeat = setInterval(() => subscriber.next({ type: 'heartbeat', data: {} }), 15000);
      const lifetime = setTimeout(() => subscriber.complete(), 120000);
      void tick();
      return () => {
        closed = true; clearInterval(poll); clearInterval(heartbeat); clearTimeout(lifetime);
        const remaining = (this.connections.get(userId) ?? 1) - 1;
        if (remaining > 0) this.connections.set(userId, remaining); else this.connections.delete(userId);
      };
    });
  }
}
