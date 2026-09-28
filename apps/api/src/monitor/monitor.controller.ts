import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { validate } from '../auth/validation.js';
import { monitorSchema, eventPageSchema, workflowCursorSchema } from './monitor.schema.js';
import { MonitorService } from './monitor.service.js';
@Controller('workspaces/:workspaceId/monitor')
@UseGuards(AuthGuard)
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}
  @Get()
  overview(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Query() query: unknown) { return this.monitor.overview(req.user.id, workspaceId, validate(monitorSchema, query)); }
  @Get('workflows')
  workflows(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Query() query: unknown) { return this.monitor.workflows(req.user.id, workspaceId, validate(workflowCursorSchema, query).cursor); }
  @Get('runs/:id')
  detail(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: unknown) { return this.monitor.detail(req.user.id, workspaceId, id, validate(eventPageSchema, query).page); }
}
