import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      if (request.get('origin') !== origin || request.get('x-requested-with') !== 'AutomationMonitor') {
        throw new ForbiddenException('Request origin is not allowed.');
      }
    }
    return true;
  }
}
