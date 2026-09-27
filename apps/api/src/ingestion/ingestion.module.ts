import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ApiKeyService } from './api-key.service.js';
import { ApiKeyController } from './api-key.controller.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { IngestionService } from './ingestion.service.js';
import { IngestionController } from './ingestion.controller.js';
@Module({ imports: [AuthModule, DatabaseModule, WorkspacesModule], controllers: [ApiKeyController, IngestionController], providers: [ApiKeyService, ApiKeyGuard, IngestionService] })
export class IngestionModule {}
