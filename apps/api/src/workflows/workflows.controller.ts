import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { DevOnlyGuard } from './dev-only.guard.js';
import { WorkflowsService } from './workflows.service.js';
@Controller('dev/workflows')
@UseGuards(DevOnlyGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}
  @Get()
  list() { return this.workflows.list(); }
  @Get(':id/runs')
  runs(@Param('id', new ParseUUIDPipe()) id: string) { return this.workflows.runs(id); }
}
