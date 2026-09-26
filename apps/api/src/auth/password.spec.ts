import { hashPassword, verifyPassword } from './password.js';
import { sessionCookieName, sessionCookieOptions } from './cookies.js';
describe('Password and cookie protections', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('salts passwords and rejects wrong or malformed hashes', async () => {
    const a=await hashPassword('a-long-test-password');
    const b=await hashPassword('a-long-test-password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('a-long-test-password',a)).toBe(true);
    expect(await verifyPassword('incorrect-password',a)).toBe(false);
    expect(await verifyPassword('a-long-test-password','broken')).toBe(false);
  });
  it('uses a host-only secure cookie in production', () => {
    vi.stubEnv('NODE_ENV','production');
    expect(sessionCookieName()).toBe('__Host-am_session');
    expect(sessionCookieOptions()).toMatchObject({httpOnly:true,secure:true,path:'/',sameSite:'lax'});
    expect(sessionCookieOptions()).not.toHaveProperty('domain');
  });
});
