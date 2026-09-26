import type { CookieOptions } from 'express';
export function sessionCookieName() { return process.env.NODE_ENV === 'production' ? '__Host-am_session' : 'am_session'; }
export function sessionCookieOptions(): CookieOptions { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }; }
