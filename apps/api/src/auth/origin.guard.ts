import { Reflector } from '@nestjs/core';
import { MACHINE_AUTH } from './machine-auth.js';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(MACHINE_AUTH, [context.getHandler(), context.getClass()])) return true;
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
