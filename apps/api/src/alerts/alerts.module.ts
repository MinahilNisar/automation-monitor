import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AlertsController } from './alerts.controller.js';
import { AlertsService } from './alerts.service.js';
@Module({ imports: [AuthModule, DatabaseModule, WorkspacesModule], controllers: [AlertsController], providers: [AlertsService] })
export class AlertsModule {}
