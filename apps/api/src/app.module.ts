import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { OriginGuard } from './auth/origin.guard.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]), AuthModule, WorkspacesModule, WorkflowsModule],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: OriginGuard }, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
