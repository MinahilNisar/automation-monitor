import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { MachineAuth } from '../auth/machine-auth.js';
import { validate } from '../auth/validation.js';
import { ApiKeyGuard } from './api-key.guard.js';
import type { IngestRequest } from './api-key.guard.js';
import { eventSchema } from './event.schema.js';
import { IngestionService } from './ingestion.service.js';
@Controller('ingest/workflows/:workflowId/events')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}
  @Post()
  @HttpCode(200)
  @MachineAuth()
  @UseGuards(ApiKeyGuard)
  receive(@Req() req: IngestRequest, @Body() body: unknown) { return this.ingestion.accept(req.ingestionKey, validate(eventSchema, body)); }
}
