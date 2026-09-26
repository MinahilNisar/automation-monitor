import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { nameSchema, validate } from '../auth/validation.js';
import { WorkflowsService } from './workflows.service.js';
@Controller('workspaces/:workspaceId/workflows')
@UseGuards(AuthGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}
  @Get()
  list(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) { return this.workflows.list(req.user.id, workspaceId); }
  @Post()
  create(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Body() body: unknown) {
    const data = validate(z.object({ name: nameSchema, slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }).strict(), body);
    return this.workflows.create(req.user.id, workspaceId, data);
  }
  @Get(':id/runs')
  runs(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string) { return this.workflows.runs(req.user.id, workspaceId, id); }
}
