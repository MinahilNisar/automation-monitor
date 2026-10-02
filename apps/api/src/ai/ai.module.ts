import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AiProvider } from './ai.provider.js';
@Module({ imports: [AuthModule, DatabaseModule, WorkspacesModule], controllers: [AiController], providers: [AiService, AiProvider] })
export class AiModule {}
