import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthRequest } from '../auth/auth.guard.js';
import { emailSchema, nameSchema, validate } from '../auth/validation.js';
import { WorkspacesService } from './workspaces.service.js';
@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}
  @Get()
  list(@Req() req: AuthRequest) { return this.workspaces.list(req.user.id); }
  @Post()
  create(@Req() req: AuthRequest, @Body() body: unknown) { return this.workspaces.create(req.user.id, validate(z.object({ name: nameSchema }).strict(), body).name); }
  @Get(':id/members')
  members(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.workspaces.members(req.user.id, id); }
  @Post(':id/members')
  add(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) { return this.workspaces.addMember(req.user.id, id, validate(z.object({ email: emailSchema }).strict(), body).email); }
  @Delete(':id/members/:userId')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Param('userId', new ParseUUIDPipe()) userId: string) { return this.workspaces.removeMember(req.user.id, id, userId); }
}
