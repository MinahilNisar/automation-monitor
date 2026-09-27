import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyService } from './api-key.service.js';
export type IngestRequest = Request & { ingestionKey: { id: string; workflowId: string } };
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<IngestRequest>();
    req.ingestionKey = await this.keys.authenticate(req.get('authorization'), String(req.params.workflowId));
    return true;
  }
}
