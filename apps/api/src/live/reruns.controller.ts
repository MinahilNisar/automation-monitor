import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { validate } from '../auth/validation.js';
import { rerunSchema } from './reruns.schema.js';
import { RerunsService } from './reruns.service.js';
@Controller('workspaces/:workspaceId/runs/:runId/rerun')
@UseGuards(AuthGuard)
export class RerunsController {
  constructor(private readonly reruns: RerunsService) {}
  @Get()
  overview(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('runId', new ParseUUIDPipe()) runId: string) { return this.reruns.overview(req.user.id, workspaceId, runId); }
  @Post()
  @HttpCode(200)
  request(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('runId', new ParseUUIDPipe()) runId: string, @Body() body: unknown) { return this.reruns.request(req.user.id, req.user.name, workspaceId, runId, validate(rerunSchema, body).requestId); }
}
