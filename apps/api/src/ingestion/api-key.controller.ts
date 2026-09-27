import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { validate } from '../auth/validation.js';
import { ApiKeyService } from './api-key.service.js';
@Controller('workspaces/:workspaceId/workflows/:workflowId/keys')
@UseGuards(AuthGuard)
export class ApiKeyController {
  constructor(private readonly keys: ApiKeyService) {}
  @Get()
  list(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('workflowId', new ParseUUIDPipe()) workflowId: string) { return this.keys.list(req.user.id, workspaceId, workflowId); }
  @Post()
  create(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('workflowId', new ParseUUIDPipe()) workflowId: string, @Body() body: unknown) {
    return this.keys.create(req.user.id, workspaceId, workflowId, validate(z.object({ label: z.string().trim().min(1).max(64) }).strict(), body).label);
  }
  @Delete(':keyId')
  @HttpCode(204)
  revoke(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('workflowId', new ParseUUIDPipe()) workflowId: string, @Param('keyId', new ParseUUIDPipe()) keyId: string) { return this.keys.revoke(req.user.id, workspaceId, workflowId, keyId); }
}
