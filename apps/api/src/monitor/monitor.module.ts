import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { MonitorController } from './monitor.controller.js';
import { MonitorService } from './monitor.service.js';
@Module({ imports: [AuthModule, DatabaseModule, WorkspacesModule], controllers: [MonitorController], providers: [MonitorService] })
export class MonitorModule {}
