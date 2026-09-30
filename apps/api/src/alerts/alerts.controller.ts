import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { validate } from '../auth/validation.js';
import { AlertsService } from './alerts.service.js';
import { alertPageSchema, policySchema } from './alerts.schema.js';
@Controller('workspaces/:workspaceId')
@UseGuards(AuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}
  @Get('alerts')
  list(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Query() query: unknown) { return this.alerts.list(req.user.id, workspaceId, validate(alertPageSchema, query).page); }
  @Patch('alerts/:id/read')
  read(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string) { return this.alerts.markRead(req.user.id, workspaceId, id); }
  @Get('workflows/:id/alert-policy')
  policy(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string) { return this.alerts.policy(req.user.id, workspaceId, id); }
  @Put('workflows/:id/alert-policy')
  save(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) { return this.alerts.savePolicy(req.user.id, workspaceId, id, validate(policySchema, body)); }
}
