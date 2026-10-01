import { Controller, Header, Param, ParseUUIDPipe, Req, Sse, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { sessionCookieName } from '../auth/cookies.js';
import { LiveService } from './live.service.js';
@Controller('workspaces/:workspaceId/live')
@UseGuards(AuthGuard)
export class LiveController {
  constructor(private readonly live: LiveService) {}
  @Sse()
  @Header('X-Accel-Buffering', 'no')
  stream(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.live.open(req.user.id, workspaceId, req.cookies[sessionCookieName()] as string);
  }
}
