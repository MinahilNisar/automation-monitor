import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { WorkflowsController } from './workflows.controller.js';
import { WorkflowsService } from './workflows.service.js';
import { DevOnlyGuard } from './dev-only.guard.js';
@Module({ imports: [DatabaseModule], controllers: [WorkflowsController], providers: [WorkflowsService, DevOnlyGuard] })
export class WorkflowsModule {}
