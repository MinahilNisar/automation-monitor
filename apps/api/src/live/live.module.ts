import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { LiveService } from './live.service.js';
import { LiveController } from './live.controller.js';
import { RerunsController } from './reruns.controller.js';
import { RerunsService } from './reruns.service.js';
import { RerunAdapter } from './rerun-adapter.js';
@Module({ imports: [AuthModule, DatabaseModule, WorkspacesModule], controllers: [LiveController, RerunsController], providers: [LiveService, RerunsService, RerunAdapter] })
export class LiveModule {}
