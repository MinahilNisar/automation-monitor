import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { sessionCookieName } from './cookies.js';
export type AuthRequest = Request & { user: { id: string; name: string; email: string } };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    req.user = await this.auth.resolve(req.cookies?.[sessionCookieName()]);
    return true;
  }
}
