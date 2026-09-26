import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { WorkflowsController } from './workflows.controller.js';
import { WorkflowsService } from './workflows.service.js';
@Module({ imports: [DatabaseModule, AuthModule, WorkspacesModule], controllers: [WorkflowsController], providers: [WorkflowsService] })
export class WorkflowsModule {}
