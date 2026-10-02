import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard.js';
import { validate } from '../auth/validation.js';
import { AiService } from './ai.service.js';
const requestSchema = z.object({ evidenceHash: z.string().regex(/^[a-f0-9]{64}$/), confirmExternalProcessing: z.literal(true) }).strict();
@Controller('workspaces/:workspaceId/runs/:runId/ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Get()
  preview(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('runId', new ParseUUIDPipe()) runId: string) { return this.ai.preview(req.user.id, workspaceId, runId); }
  @Post()
  @HttpCode(200)
  generate(@Req() req: AuthRequest, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string, @Param('runId', new ParseUUIDPipe()) runId: string, @Body() body: unknown) { return this.ai.generate(req.user.id, workspaceId, runId, validate(requestSchema, body).evidenceHash); }
}
