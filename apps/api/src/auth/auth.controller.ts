import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthRequest } from './auth.guard.js';
import { sessionCookieName, sessionCookieOptions } from './cookies.js';
import { emailSchema, nameSchema, passwordSchema, validate } from './validation.js';
const registration = z.object({ email: emailSchema, name: nameSchema, password: passwordSchema, workspaceName: nameSchema }).strict();
const credentials = z.object({ email: emailSchema, password: passwordSchema }).strict();
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(validate(registration, body));
    const session = await this.auth.issue(user.id, req.cookies?.[sessionCookieName()]);
    res.cookie(sessionCookieName(), session.token, { ...sessionCookieOptions(), expires: session.expiresAt });
    return user;
  }
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const data = validate(credentials, body);
    const user = await this.auth.login(data.email, data.password);
    const session = await this.auth.issue(user.id, req.cookies?.[sessionCookieName()]);
    res.cookie(sessionCookieName(), session.token, { ...sessionCookieOptions(), expires: session.expiresAt });
    return user;
  }
  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthRequest) { return req.user; }
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[sessionCookieName()]);
    res.clearCookie(sessionCookieName(), sessionCookieOptions());
  }
}
